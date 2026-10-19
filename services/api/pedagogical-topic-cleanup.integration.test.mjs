import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url = process.env.PEDAGOGICAL_TOPICS_TEST_DATABASE_URL;

test('remove somente ramos incorretos arquivados e sem uso, preservando cópia recuperável', {skip:!url}, async () => {
  const client = new pg.Client({connectionString:url});
  const schema = `cleanup_${randomUUID().replaceAll('-','')}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE pedagogical_disciplines(id uuid PRIMARY KEY,name text,stage text);
      CREATE TABLE pedagogical_topics(id uuid PRIMARY KEY,discipline_id uuid REFERENCES pedagogical_disciplines(id),parent_id uuid REFERENCES pedagogical_topics(id) ON DELETE CASCADE,name text,active boolean,source_reference text);
      CREATE TABLE question_revisions(id uuid PRIMARY KEY,pedagogical_topic_id uuid REFERENCES pedagogical_topics(id) ON DELETE SET NULL);
      CREATE TABLE exam_imports(id uuid PRIMARY KEY,extracted_candidates jsonb);
      CREATE TABLE question_editor_drafts(id uuid PRIMARY KEY,payload jsonb,completed_at timestamptz);
      CREATE TABLE pedagogical_topic_skills(topic_id uuid REFERENCES pedagogical_topics(id) ON DELETE CASCADE,skill_id uuid);`);
    const math = randomUUID();
    await client.query("INSERT INTO pedagogical_disciplines VALUES($1,'Matemática','Ensino Médio')",[math]);
    async function add({discipline=math,parent=null,name='Conteúdos',active=false,source='Referencial Curricular do Ensino Médio de MS (2012)'}={}) {
      const id=randomUUID();
      await client.query('INSERT INTO pedagogical_topics VALUES($1,$2,$3,$4,$5,$6)',[id,discipline,parent,name,active,source]);
      return id;
    }
    const root=await add(), child=await add({parent:root,name:'Ácidos'}), detail=await add({parent:child,name:'Nomenclatura'});
    const skill=randomUUID();
    await client.query('INSERT INTO pedagogical_topic_skills VALUES($1,$2)',[child,skill]);
    const protectedIds=[];
    for (const name of ['Química','Física','Biologia']) {
      const discipline=randomUUID();
      await client.query("INSERT INTO pedagogical_disciplines VALUES($1,$2,'Ensino Médio')",[discipline,name]);
      protectedIds.push(await add({discipline}));
    }
    protectedIds.push(await add({source:'Catálogo manual'}),await add({active:true}));
    const usedRoot=await add(), usedChild=await add({parent:usedRoot,name:'Vinculado'});
    await client.query('INSERT INTO question_revisions VALUES($1,$2)',[randomUUID(),usedChild]);
    const draftRoot=await add();
    await client.query('INSERT INTO question_editor_drafts VALUES($1,$2,NULL)',[randomUUID(),JSON.stringify({pedagogicalObjectId:draftRoot})]);
    const importRoot=await add();
    await client.query('INSERT INTO exam_imports VALUES($1,$2)',[randomUUID(),JSON.stringify([{pedagogicalTopicId:importRoot}])]);
    protectedIds.push(importRoot);
    const activeRoot=await add(), activeChild=await add({parent:activeRoot,name:'Filho ativo',active:true});
    protectedIds.push(usedRoot,usedChild,draftRoot,activeRoot,activeChild);
    const source=await readFile(new URL('../../database/087_remove_unused_misclassified_math_topics.sql',import.meta.url),'utf8');
    for (let run=0;run<2;run++) {
      await client.query('BEGIN');
      await client.query(source);
      await client.query('COMMIT');
      const remaining=(await client.query('SELECT id FROM pedagogical_topics ORDER BY id')).rows.map(t=>t.id);
      assert.deepEqual(remaining,protectedIds.sort());
      const backup=(await client.query('SELECT * FROM pedagogical_topic_cleanup_backups')).rows;
      assert.equal(backup.length,3);
      assert.deepEqual(backup.map(t=>t.topic_id).sort(),[root,child,detail].sort());
      assert.equal(backup.find(t=>t.topic_id===child).topic.parent_id,root);
      assert.equal(backup.find(t=>t.topic_id===child).skill_links[0].skill_id,skill);
      assert.equal((await client.query('SELECT pedagogical_topic_id FROM question_revisions')).rows[0].pedagogical_topic_id,usedChild);
    }
  } finally {
    await client.query('ROLLBACK');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
