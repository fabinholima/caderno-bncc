import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const url=process.env.PEDAGOGICAL_TOPICS_TEST_DATABASE_URL;

test('exclui hierarquia sem uso e protege vínculos, confirmação e instituição', {skip:!url}, async()=>{
  const schema=`delete_${randomUUID().replaceAll('-','')}`;
  const client=new pg.Client({connectionString:url});
  await client.connect();
  let pool;
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE pedagogical_topics(id uuid PRIMARY KEY,institution_id uuid,discipline_id uuid,parent_id uuid REFERENCES pedagogical_topics(id) ON DELETE CASCADE,name text,active boolean);
      CREATE TABLE pedagogical_topic_skills(topic_id uuid REFERENCES pedagogical_topics(id) ON DELETE CASCADE,skill_id uuid);
      CREATE TABLE question_revisions(id uuid PRIMARY KEY,pedagogical_topic_id uuid REFERENCES pedagogical_topics(id) ON DELETE SET NULL);
      CREATE TABLE question_editor_drafts(id uuid PRIMARY KEY,payload jsonb,completed_at timestamptz);
      CREATE TABLE exam_imports(id uuid PRIMARY KEY,extracted_candidates jsonb);`);
    const dbUrl=new URL(url);dbUrl.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=dbUrl.href;
    pool=(await import('./db.mjs')).pool;
    const {deletePedagogicalTopic}=await import('./pedagogical-disciplines.mjs');
    const institutionId=randomUUID(),disciplineId=randomUUID();
    const add=async(parent=null,active=true,institution=institutionId)=>{
      const id=randomUUID();await client.query('INSERT INTO pedagogical_topics VALUES($1,$2,$3,$4,$5,$6)',[id,institution,disciplineId,parent,'Tópico',active]);return id;
    };
    const remove=(id,ids=[id],institution=institutionId)=>deletePedagogicalTopic({institutionId:institution,topicId:id,input:{expectedTopicIds:ids}});
    const root=await add(),child=await add(root),detail=await add(child);
    await client.query('INSERT INTO pedagogical_topic_skills VALUES($1,$2)',[detail,randomUUID()]);
    await assert.rejects(remove(root,[root,child]),{statusCode:409});
    assert.equal((await client.query('SELECT count(*)::int AS n FROM pedagogical_topics')).rows[0].n,3);
    await assert.rejects(remove(root,[root,child,detail],randomUUID()),{statusCode:404});
    await client.query('INSERT INTO question_revisions VALUES($1,$2)',[randomUUID(),detail]);
    await assert.rejects(remove(root,[root,child,detail]),{statusCode:409});
    assert.equal((await client.query('SELECT pedagogical_topic_id FROM question_revisions')).rows[0].pedagogical_topic_id,detail);
    await client.query('DELETE FROM question_revisions');
    const draftId=randomUUID();
    await client.query('INSERT INTO question_editor_drafts VALUES($1,$2,NULL)',[draftId,JSON.stringify({pedagogicalDetailId:detail.toUpperCase()})]);
    await assert.rejects(remove(root,[root,child,detail]),{statusCode:409});
    await client.query('UPDATE question_editor_drafts SET completed_at=now() WHERE id=$1',[draftId]);
    await client.query('INSERT INTO exam_imports VALUES($1,$2)',[randomUUID(),JSON.stringify([{pedagogicalTopicId:child}])]);
    await assert.rejects(remove(root,[root,child,detail]),{statusCode:409});
    await client.query('DELETE FROM exam_imports');
    const sibling=await add(root);
    const result=await remove(child,[child,detail]);
    assert.equal(result.deletedCount,2);
    assert.deepEqual((await client.query('SELECT id FROM pedagogical_topics ORDER BY id')).rows.map(t=>t.id),[root,sibling].sort());
    assert.equal((await client.query('SELECT count(*)::int AS n FROM pedagogical_topic_skills')).rows[0].n,0);
    await assert.rejects(remove(child,[child,detail]),{statusCode:404});
    await remove(root,[root,sibling]);
    const archived=await add(null,false);
    assert.equal((await remove(archived.toUpperCase(),[archived.toUpperCase()])).deletedCount,1);
  } finally {
    if(pool)await pool.end();
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await client.end();
  }
});
