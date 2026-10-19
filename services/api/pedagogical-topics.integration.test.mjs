import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const url = process.env.PEDAGOGICAL_TOPICS_TEST_DATABASE_URL;

test('cadastra subtópicos de Matemática, herda série e informa conflitos sem perder o catálogo', { skip: !url }, async () => {
  const schema = `topics_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let pool;
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE pedagogical_disciplines(id uuid PRIMARY KEY,institution_id uuid,name text,stage text);
      CREATE TABLE pedagogical_topics(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid NOT NULL,discipline_id uuid REFERENCES pedagogical_disciplines(id),parent_id uuid REFERENCES pedagogical_topics(id),name text NOT NULL,grade_range text,position int,active boolean DEFAULT true,updated_by uuid REFERENCES users(id),updated_at timestamptz DEFAULT now());
      CREATE UNIQUE INDEX pedagogical_topics_root_unique ON pedagogical_topics(discipline_id,lower(name),COALESCE(grade_range,'')) WHERE parent_id IS NULL;
      CREATE UNIQUE INDEX pedagogical_topics_child_unique ON pedagogical_topics(parent_id,lower(name)) WHERE parent_id IS NOT NULL;
      CREATE TABLE curriculum_skills(id uuid PRIMARY KEY,code text,description text);
      CREATE TABLE pedagogical_topic_skills(topic_id uuid,skill_id uuid);`);
    const dbUrl = new URL(url); dbUrl.searchParams.set('options', `-c search_path=${schema}`); process.env.DATABASE_URL = dbUrl.href;
    pool = (await import('./db.mjs')).pool;
    const { createPedagogicalTopic, updatePedagogicalTopic, listPedagogicalTopics } = await import('./pedagogical-disciplines.mjs');
    const institutionId = randomUUID(), userId = randomUUID(), disciplineId = randomUUID(), otherId = randomUUID();
    await client.query('INSERT INTO users VALUES($1)', [userId]);
    await client.query("INSERT INTO pedagogical_disciplines VALUES($1,$2,'Matemática','Ensino Médio'),($3,$4,'Matemática','Ensino Médio')", [disciplineId,institutionId,otherId,randomUUID()]);
    const create = input => createPedagogicalTopic({ institutionId,userId,input:{disciplineId,...input} });
    const root = await create({ name:'Funções',gradeRange:'1º Ano' });
    assert.equal(root.grade_range,'1ª série');
    const child = await create({ parentId:root.id,name:'Função afim',gradeRange:'1ª série' });
    assert.equal(child.parent_id,root.id); assert.equal(child.grade_range,'1ª série');
    const detail = await create({ parentId:child.id,name:'Leitura de gráficos' });
    assert.equal(detail.grade_range,'1ª série');
    await assert.rejects(create({ parentId:detail.id,name:'Quarto nível' }), {statusCode:422});
    await assert.rejects(create({ parentId:root.id,name:'FUNÇÃO AFIM' }), {statusCode:409});
    await assert.rejects(create({ name:'Funções',gradeRange:'1ª série' }), {statusCode:409});
    await assert.rejects(create({ parentId:root.id,name:'Outro assunto',gradeRange:'2ª série' }), {statusCode:422});
    await assert.rejects(create({ disciplineId:otherId,name:'Objeto externo',gradeRange:'1ª série' }), {statusCode:404});
    const sibling = await create({parentId:root.id,name:'Função quadrática'});
    await assert.rejects(updatePedagogicalTopic({institutionId,userId,topicId:sibling.id,input:{name:'Função afim'}}),{statusCode:409});
    await client.query('UPDATE pedagogical_topics SET grade_range=NULL WHERE id=$1',[child.id]);
    const inherited = await create({parentId:child.id,name:'Coeficientes'});
    assert.equal(inherited.grade_range,'1ª série');
    await client.query("UPDATE pedagogical_topics SET grade_range='1º Ano' WHERE id=$1",[root.id]);
    const legacy = await create({parentId:root.id,name:'Crescimento',gradeRange:'1ª série'});
    assert.equal(legacy.grade_range,'1ª série');
    const topics = await listPedagogicalTopics({institutionId,disciplineId});
    assert.equal(topics.find(t=>t.id===root.id).grade_range,'1ª série');
    assert.equal(topics.find(t=>t.id===detail.id).depth,2);
    // Moving a root keeps every descendant in the same series, atomically.
    await updatePedagogicalTopic({institutionId,userId,topicId:root.id,input:{gradeRange:'2ª série'}});
    const moved = await listPedagogicalTopics({institutionId,disciplineId});
    assert(moved.every(topic => topic.grade_range === '2ª série'));
    assert.equal((await client.query('SELECT grade_range FROM pedagogical_topics WHERE id=$1',[detail.id])).rows[0].grade_range,'2ª série');
    await assert.rejects(updatePedagogicalTopic({institutionId,userId,topicId:child.id,input:{gradeRange:'3ª série'}}),{statusCode:422});
    // Conflicting root names do not leave descendants partly moved.
    const sameName = await create({name:'Funções',gradeRange:'3ª série'});
    await assert.rejects(updatePedagogicalTopic({institutionId,userId,topicId:root.id,input:{gradeRange:'3ª série'}}),{statusCode:409});
    assert.equal((await client.query('SELECT grade_range FROM pedagogical_topics WHERE id=$1',[detail.id])).rows[0].grade_range,'2ª série');
    await client.query('DELETE FROM pedagogical_topics WHERE id=$1',[sameName.id]);
    await client.query('UPDATE pedagogical_topics SET active=false WHERE id=$1',[root.id]);
    await assert.rejects(create({parentId:child.id,name:'Objeto arquivado'}),{statusCode:422});
    assert.equal((await client.query('SELECT COUNT(*)::int AS total FROM pedagogical_topics')).rows[0].total,6);
    assert.equal((await listPedagogicalTopics({institutionId,disciplineId})).length,0);
    const archived = await listPedagogicalTopics({institutionId,disciplineId,includeInactive:true});
    assert.equal(archived.find(t=>t.id===child.id).active,true);
    assert.equal(archived.find(t=>t.id===child.id).effective_active,false);
    // Tied root positions still keep each subtree together.
    await client.query('UPDATE pedagogical_topics SET active=true WHERE id=$1',[root.id]);
    const otherRoot = await create({name:'Álgebra',gradeRange:'2ª série'});
    const otherChild = await create({name:'Expressões',parentId:otherRoot.id});
    await client.query('UPDATE pedagogical_topics SET position=1 WHERE id=$1 OR id=$2',[root.id,otherRoot.id]);
    const ordered = await listPedagogicalTopics({institutionId,disciplineId});
    assert.equal(ordered.findIndex(t=>t.id===otherChild.id),ordered.findIndex(t=>t.id===otherRoot.id)+1);
    const rootIndex = ordered.findIndex(t=>t.id===root.id);
    assert(ordered.slice(rootIndex+1,rootIndex+6).every(t=>t.depth>0));

    const rootsBefore = ordered.filter(t => !t.parent_id);
    await updatePedagogicalTopic({institutionId,userId,topicId:rootsBefore[1].id,input:{move:'up'}});
    const rootsAfter = (await listPedagogicalTopics({institutionId,disciplineId})).filter(t=>!t.parent_id);
    assert.deepEqual(rootsAfter.map(t=>t.id),rootsBefore.map(t=>t.id).reverse());
    assert.deepEqual(rootsAfter.map(t=>t.position),[1,2]);
    const fundamentalId = randomUUID();
    await client.query("INSERT INTO pedagogical_disciplines VALUES($1,$2,'Matemática','Ensino Fundamental')",[fundamentalId,institutionId]);
    await client.query("INSERT INTO pedagogical_topics(institution_id,discipline_id,name,grade_range,position) VALUES($1,$2,'Números','1º ano',1)",[institutionId,fundamentalId]);
    assert.equal((await listPedagogicalTopics({institutionId,disciplineId:fundamentalId}))[0].grade_range,'1º ano');
  } finally {
    if(pool) await pool.end();
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await client.end();
  }
});
