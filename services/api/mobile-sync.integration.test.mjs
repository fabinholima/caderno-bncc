import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
const enabled=!!process.env.MOBILE_SYNC_TEST_DATABASE_URL;
test('mobile upload, correction receipts, tenant isolation and optimistic concurrency in isolated PostgreSQL', {skip:!enabled},async()=>{
  const { pool }=await import('./db.mjs');
  const previousQuery=pool.query, previousConnect=pool.connect;
  const {default:pg}=await import('pg');
  const control=new pg.Pool({connectionString:process.env.MOBILE_SYNC_TEST_DATABASE_URL,max:4});
  const client=await control.connect();
  const schema=`mobile_test_${randomUUID().replaceAll('-','')}`;
  await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  pool.query=(...args)=>client.query(...args);pool.connect=async()=>{ const connection=await control.connect(); await connection.query(`SET search_path TO ${schema}`); return connection; };
  try{
    const schemaSql=`
      CREATE TABLE institutions(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE assessments(id uuid PRIMARY KEY,institution_id uuid,title text,subject text);
      CREATE TABLE assessment_versions(id uuid PRIMARY KEY,assessment_id uuid,snapshot jsonb,code text,answer_key jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE educator_schools(id uuid PRIMARY KEY);
      CREATE TABLE subscription_plans(id text PRIMARY KEY,monthly_assessments integer,max_students integer);
      CREATE TABLE institution_subscriptions(institution_id uuid,plan_id text,status text,period_started_at timestamptz,period_ends_at timestamptz);
      CREATE TABLE classes(id uuid PRIMARY KEY,name text,institution_id uuid,created_by uuid);
      CREATE TABLE class_subjects(class_id uuid,teacher_id uuid,subject text);
      CREATE TABLE students(id uuid PRIMARY KEY,name text,registration text);
      CREATE TABLE assessment_applications(id uuid PRIMARY KEY,institution_id uuid,assessment_id uuid,class_id uuid,status text,scheduled_at timestamptz,created_at timestamptz DEFAULT now(),created_by uuid);
      CREATE TABLE application_students(id uuid PRIMARY KEY,application_id uuid,student_id uuid,assessment_version_id uuid);
      CREATE TABLE class_enrollments(class_id uuid,student_id uuid,number integer);
      CREATE TABLE render_jobs(id uuid PRIMARY KEY,application_student_id uuid,status text);
      CREATE TABLE usage_events(institution_id uuid,user_id uuid,kind text,quantity integer,metadata jsonb);
      CREATE TABLE audit_log(institution_id uuid,user_id uuid,action text,entity_type text,entity_id text,metadata jsonb);`;
    for(const statement of schemaSql.split(';').filter(s=>s.trim()))await client.query(statement);
    for(const name of ['006_assessment_submissions.sql','013_card_scans.sql','014_pdf_card_scans.sql','015_scan_submissions.sql','016_multipage_card_scans.sql','018_card_scan_review.sql','066_mobile_sync_manual_review.sql','072_mobile_scan_application.sql','103_result_publication.sql','109_card_scan_image_refs.sql']){
      const sql=await readFile(new URL(`../../database/${name}`,import.meta.url),'utf8');
      await client.query(sql);
    }
    const institutionId=randomUUID(),userId=randomUUID(),assessmentId=randomUUID(),versionId=randomUUID(),classId=randomUUID(),studentId=randomUUID(),applicationId=randomUUID(),assignmentId=randomUUID();
    const snapshot={questions:[{number:1,type:'single_choice',points:1,alternatives:[{stableKey:'a',label:'A'}],answer:{correctStableKeys:['a']},statement:[{type:'paragraph',text:'Objetiva'}]},{number:2,type:'essay',points:3,alternatives:[],statement:[{type:'paragraph',text:'Explique a resposta.'}],answer:{correctStableKeys:[],explanation:[{type:'paragraph',text:'Orientação.'}]}}]};
    await client.query('INSERT INTO institutions VALUES($1)',[institutionId]);
    await client.query("INSERT INTO subscription_plans VALUES('basic',10,100)");await client.query("INSERT INTO institution_subscriptions VALUES($1,'basic','active',now()-interval '1 day',now()+interval '30 days')",[institutionId]);await client.query('INSERT INTO users VALUES($1)',[userId]);
    await client.query('INSERT INTO assessments VALUES($1,$2,$3)',[assessmentId,institutionId,'Prova']);await client.query('INSERT INTO assessment_versions VALUES($1,$2,$3::jsonb,$4)',[versionId,assessmentId,JSON.stringify(snapshot),'B']);
    await client.query('INSERT INTO classes VALUES($1,$2,$3)',[classId,'Turma A',institutionId]);await client.query('INSERT INTO students VALUES($1,$2,$3)',[studentId,'Ana Souza','001']);
    await client.query("INSERT INTO assessment_applications(id,institution_id,assessment_id,class_id,status) VALUES($1,$2,$3,$4,'scheduled')",[applicationId,institutionId,assessmentId,classId]);await client.query('INSERT INTO application_students VALUES($1,$2,$3,$4)',[assignmentId,applicationId,studentId,versionId]);
    const {createScan,confirmScanReview,getScanReview}=await import('./scans.mjs');
    const {saveManualReview}=await import('./manual-review.mjs');const {getSubmission}=await import('./submissions.mjs');
    const clientScanId=randomUUID(),input={clientScanId,imageDataUrl:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='};
    const [first,concurrentUpload]=await Promise.all([createScan({institutionId,userId,input}),createScan({institutionId,userId,input})]);assert.equal(concurrentUpload.id,first.id);
    await client.query("UPDATE card_scans SET status='review',image_data='\\x',review_image_data='\\x' WHERE id=$1",[first.id]);
    const replay=await createScan({institutionId,userId,input});assert.equal(replay.id,first.id);assert.equal(replay.status,'review');
    assert.equal((await client.query('SELECT count(*)::int n FROM card_scans')).rows[0].n,1);assert.equal((await client.query('SELECT count(*)::int n FROM usage_events')).rows[0].n,1);
    await assert.rejects(createScan({institutionId,userId,input:{...input,imageDataUrl:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAg=='}}),e=>e.statusCode===409);
    await assert.rejects(createScan({institutionId:randomUUID(),userId,input}),e=>e.statusCode===409);
    await assert.rejects(createScan({institutionId,userId,input:{...input,clientScanId:randomUUID(),expectedInstitutionId:randomUUID()}}),e=>e.statusCode===401);
    const confirmation={clientMutationId:randomUUID(),applicationStudentId:assignmentId,responses:[{questionNumber:1,selectedLabels:['A']}]};
    const grade=await confirmScanReview({institutionId,userId,scanId:first.id,input:confirmation});
    const again=await confirmScanReview({institutionId,userId,scanId:first.id,input:confirmation});assert.equal(again.submissionId,grade.submissionId);
    assert.equal((await client.query('SELECT count(*)::int n FROM assessment_submissions')).rows[0].n,1);
    // A confirmação gera resultado provisório, sem publicação.
    assert.equal(grade.publicationStatus,'unpublished');assert.equal(grade.publishable,false);
    const resultRow=async()=>(await client.query(`SELECT ar.processing_status,ar.publication_status,ar.published_version_id,v.version_number,v.correct_count,v.manual_pending_count,v.score
      FROM assessment_results ar JOIN assessment_result_versions v ON v.id=ar.current_version_id WHERE ar.application_student_id=$1`,[assignmentId])).rows[0];
    let state=await resultRow();
    assert.deepEqual([state.processing_status,state.publication_status,state.published_version_id,state.version_number,state.correct_count,state.manual_pending_count,state.score],['needs_review','unpublished',null,1,1,1,null]);
    const scan=await getScanReview({institutionId,scanId:first.id});assert.equal(scan.candidates[0].assessmentId,assessmentId);assert.equal(scan.candidates[0].classId,classId);assert.equal(scan.submissionId,grade.submissionId);assert.equal(scan.revision,0);
    const submission=await getSubmission({institutionId,submissionId:grade.submissionId});assert.equal(submission.questions[1].guide[0].text,'Orientação.');
    assert.equal(await getSubmission({institutionId:randomUUID(),submissionId:grade.submissionId}),null);
    const manual={clientMutationId:randomUUID(),expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:2.5,feedback:'Bom trabalho'}]};
    const [saved,concurrentManual]=await Promise.all([saveManualReview({institutionId,userId,submissionId:grade.submissionId,input:manual}),saveManualReview({institutionId,userId,submissionId:grade.submissionId,input:manual})]);assert.equal(concurrentManual.revision,1);assert.equal(saved.score,3.5);assert.equal(saved.revision,1);assert.equal(saved.requiresManualReview,false);
    const repeated=await saveManualReview({institutionId,userId,submissionId:grade.submissionId,input:manual});assert.equal(repeated.revision,1);
    assert.equal((await getSubmission({institutionId,submissionId:grade.submissionId})).revision,1);
    // A nota da discursiva fecha a versão provisória; repetições não criam versões.
    state=await resultRow();
    assert.deepEqual([state.processing_status,state.publication_status,state.version_number,state.manual_pending_count,Number(state.score)],['ready','unpublished',2,0,3.5]);
    assert.equal((await client.query('SELECT count(*)::int n FROM assessment_result_versions')).rows[0].n,2);
    assert.deepEqual((await client.query('SELECT question_number,previous_status,new_status FROM assessment_result_changes')).rows,[{question_number:2,previous_status:'manual_pending',new_status:'manual_graded'}]);
    await assert.rejects(saveManualReview({institutionId,userId,submissionId:grade.submissionId,input:{...manual,clientMutationId:randomUUID()}}),e=>e.statusCode===409);
    await assert.rejects(saveManualReview({institutionId,userId,submissionId:grade.submissionId,input:{...manual,reviews:[{questionNumber:2,awardedPoints:0}]}}),e=>e.statusCode===409);
    await assert.rejects(saveManualReview({institutionId:randomUUID(),userId,submissionId:grade.submissionId,input:{...manual,clientMutationId:randomUUID()}}),e=>e.statusCode===404);
    assert.equal((await client.query('SELECT count(*)::int n FROM audit_log')).rows[0].n,1);
    // Assinatura inativa bloqueia novas correções, mas não um envio já recebido.
    await client.query("UPDATE institution_subscriptions SET status='past_due' WHERE institution_id=$1",[institutionId]);
    await assert.rejects(createScan({institutionId,userId,input:{...input,clientScanId:randomUUID()}}),e=>e.statusCode===402);
    assert.equal((await createScan({institutionId,userId,input})).id,first.id);
    await client.query("UPDATE institution_subscriptions SET status='active' WHERE institution_id=$1",[institutionId]);
    // Um segundo cartão do mesmo aluno é identificado como duplicado.
    const {findDuplicateScan}=await import('./result-versions.mjs');
    assert.equal(await findDuplicateScan(client,{applicationStudentId:assignmentId,scanId:randomUUID()}),first.id);
    assert.equal(await findDuplicateScan(client,{applicationStudentId:assignmentId,scanId:first.id}),null);
    const {listApplications}=await import('./academic.mjs');
    const listed=await listApplications({institutionId});assert.equal(listed[0].assessmentId,assessmentId);assert.equal(listed[0].classId,classId);
    assert.deepEqual(listed[0].versions,[{code:'B',questions:2,objective:1,missingAnswerKeys:[]}]);assert.equal(listed[0].answerKeyReady,true);
    // A capture is bound to the application; review cannot change that binding.
    const scopedInput={...input,clientScanId:randomUUID(),expectedApplicationId:applicationId};
    const scoped=await createScan({institutionId,userId,input:scopedInput});
    const otherApplication=randomUUID(),otherClass=randomUUID(),otherAssignment=randomUUID();
    await client.query('INSERT INTO classes VALUES($1,$2,$3)',[otherClass,'Outra turma',institutionId]);
    await client.query("INSERT INTO assessment_applications(id,institution_id,assessment_id,class_id,status) VALUES($1,$2,$3,$4,'scheduled')",[otherApplication,institutionId,assessmentId,otherClass]);
    await client.query('INSERT INTO application_students VALUES($1,$2,$3,$4)',[otherAssignment,otherApplication,studentId,versionId]);
    await assert.rejects(createScan({institutionId,userId,input:{...scopedInput,expectedApplicationId:otherApplication}}),e=>e.statusCode===409);
    await assert.rejects(createScan({institutionId,userId,input:{...scopedInput,clientScanId:randomUUID(),expectedApplicationId:randomUUID()}}),e=>e.statusCode===422);
    // Gabarito incompleto: a aplicação aparece bloqueada e a correção não começa.
    const draftAssessment=randomUUID(),draftApplication=randomUUID(),draftClass=randomUUID();
    await client.query('INSERT INTO assessments VALUES($1,$2,$3)',[draftAssessment,institutionId,'Rascunho']);
    await client.query('INSERT INTO assessment_versions VALUES($1,$2,$3::jsonb,$4)',[randomUUID(),draftAssessment,JSON.stringify({questions:[{...snapshot.questions[0],answer:{correctStableKeys:[]}}]}),'A']);
    await client.query('INSERT INTO classes VALUES($1,$2,$3)',[draftClass,'Turma rascunho',institutionId]);
    await client.query("INSERT INTO assessment_applications(id,institution_id,assessment_id,class_id,status) VALUES($1,$2,$3,$4,'scheduled')",[draftApplication,institutionId,draftAssessment,draftClass]);
    const draftListed=(await listApplications({institutionId})).find(item=>item.id===draftApplication);
    assert.equal(draftListed.answerKeyReady,false);assert.deepEqual(draftListed.versions[0].missingAnswerKeys,[1]);
    await assert.rejects(createScan({institutionId,userId,input:{...input,clientScanId:randomUUID(),expectedApplicationId:draftApplication}}),e=>e.code==='answer_key_incomplete'&&/versão A, questões 1/.test(e.message));
    await client.query('DELETE FROM assessment_applications WHERE id=$1',[draftApplication]);
    await client.query("UPDATE card_scans SET status='review' WHERE id=$1",[scoped.id]);
    assert.deepEqual((await getScanReview({institutionId,scanId:scoped.id})).candidates.map(x=>x.id),[assignmentId]);
    await assert.rejects(confirmScanReview({institutionId,userId,scanId:scoped.id,input:{...confirmation,clientMutationId:randomUUID(),applicationStudentId:otherAssignment}}),e=>e.statusCode===409);
    // Optional real image -> reader -> PostgreSQL -> grade integration.
    if(process.env.OMR_TEST_IMAGE && process.env.OMR_PYTHON) {
      await client.query('ALTER TABLE application_students ADD COLUMN qr_payload text');
      const objective={questions:Array.from({length:10},(_,i)=>({number:i+1,type:'single_choice',points:1,alternatives:['A','B','C','D','E'].map(label=>({label,stableKey:label.toLowerCase()})),answer:{correctStableKeys:['abcde'[i%5]]}}))};
      const realVersion=randomUUID();await client.query('INSERT INTO assessment_versions VALUES($1,$2,$3::jsonb,$4)',[realVersion,assessmentId,JSON.stringify(objective),'C']);
      await client.query('UPDATE application_students SET assessment_version_id=$2,qr_payload=$3 WHERE id=$1',[otherAssignment,realVersion,'CBS1:00000000-0000-4000-8000-000000000001:synthetic-test']);
      const imageDataUrl='data:image/png;base64,'+(await readFile(process.env.OMR_TEST_IMAGE)).toString('base64');
      const correct=await createScan({institutionId,userId,input:{clientScanId:randomUUID(),imageDataUrl,expectedApplicationId:otherApplication}});
      const wrong=await createScan({institutionId,userId,input:{clientScanId:randomUUID(),imageDataUrl,expectedApplicationId:applicationId}});
      const workerUrl=new URL(process.env.MOBILE_SYNC_TEST_DATABASE_URL);workerUrl.searchParams.set('options',`-c search_path=${schema}`);
      const worker=spawn(process.execPath,[new URL('../omr/worker.mjs',import.meta.url).pathname],{env:{...process.env,DATABASE_URL:workerUrl.href},stdio:['ignore','ignore','pipe']});
      let workerErrors='';worker.stderr.on('data',chunk=>workerErrors+=chunk);const ended=once(worker,'exit');
      try {
        let cards=[];for(let attempt=0;attempt<30;attempt++){
          cards=(await client.query('SELECT id,status,submission_id,error_message FROM card_scans WHERE id=ANY($1::uuid[])',[[correct.id,wrong.id]])).rows;
          if(cards.every(x=>['completed','failed','review'].includes(x.status)))break;
          await new Promise(resolve=>setTimeout(resolve,500));
        }
        const accepted=cards.find(x=>x.id===correct.id),rejected=cards.find(x=>x.id===wrong.id);
        assert.equal(accepted.status,'completed',accepted.error_message || workerErrors);assert.equal(rejected.status,'failed',workerErrors);assert.equal(rejected.submission_id,null);assert.match(rejected.error_message,/outra aplicação/);
        const result=await getSubmission({institutionId,submissionId:accepted.submission_id});assert.equal(result.score,10);assert.equal(result.maxScore,10);assert.equal(result.requiresManualReview,false);
        // Leitura sem pendências fica pronta, mas não publicada.
        const omrResult=(await client.query(`SELECT ar.processing_status,ar.publication_status,v.source,v.correct_count,v.valid_count,v.card_scan_id
          FROM assessment_results ar JOIN assessment_result_versions v ON v.id=ar.current_version_id WHERE ar.application_student_id=$1`,[otherAssignment])).rows[0];
        assert.deepEqual(omrResult,{processing_status:'ready',publication_status:'unpublished',source:'omr',correct_count:10,valid_count:10,card_scan_id:correct.id});
        // Outro cartão do mesmo aluno vai para revisão e não altera o resultado.
        const duplicate=await createScan({institutionId,userId,input:{clientScanId:randomUUID(),imageDataUrl,expectedApplicationId:otherApplication}});
        let dup;for(let attempt=0;attempt<30;attempt++){
          dup=(await client.query('SELECT status,submission_id,result FROM card_scans WHERE id=$1',[duplicate.id])).rows[0];
          if(['completed','failed','review'].includes(dup.status))break;
          await new Promise(resolve=>setTimeout(resolve,500));
        }
        assert.equal(dup.status,'review',workerErrors);assert.equal(dup.submission_id,null);assert.equal(dup.result.duplicateOfScanId,correct.id);
        assert.equal((await client.query('SELECT count(*)::int n FROM assessment_result_versions v JOIN assessment_results ar ON ar.id=v.result_id WHERE ar.application_student_id=$1',[otherAssignment])).rows[0].n,1);
      }finally{worker.kill('SIGTERM');await ended;}
    }
  }finally{
    pool.query=previousQuery;pool.connect=previousConnect;
    await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await control.end();
    await pool.end();
  }
});
