-- Recover editable assemblies for existing assessments without changing snapshots.
INSERT INTO assessment_workspaces(institution_id,created_by,configuration,assessment_id,created_at,updated_at)
SELECT a.institution_id,a.created_by,
 jsonb_build_object(
 'title',a.title,'grade',a.grade,
 'header', jsonb_build_object('institutionName',COALESCE(v.snapshot#>>'{institution,name}','Instituição de ensino'),'teacherName',COALESCE(v.snapshot#>>'{assessment,header,teacherName}',''),'className',COALESCE(v.snapshot#>>'{assessment,header,className}',''),'term',COALESCE(v.snapshot#>>'{assessment,header,term}',''),'date',COALESCE(v.snapshot#>>'{assessment,header,date}',''),'transcriptionPhrase',COALESCE(v.snapshot#>>'{assessment,header,transcriptionPhrase}',''),'logoDataUrl',COALESCE(v.snapshot#>>'{institution,logoDataUrl}','')),
 'sections',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s->>'id','subject',s->>'subject','columns',COALESCE(s->'columns','1'::jsonb),'startOnNewPage',COALESCE(s->'startOnNewPage','false'::jsonb),'questionIds',COALESCE((SELECT jsonb_agg(q->'sourceQuestionId') FROM jsonb_array_elements(s->'questions') q),'[]'::jsonb),'fullWidthQuestionIds',COALESCE((SELECT jsonb_agg(q->'sourceQuestionId') FROM jsonb_array_elements(s->'questions') q WHERE q->>'fullWidth'='true'),'[]'::jsonb)) ORDER BY position) FROM jsonb_array_elements(v.snapshot->'sections') WITH ORDINALITY AS item(s,position)),'[]'::jsonb),
 'questionPoints',COALESCE((SELECT jsonb_object_agg(q->>'sourceQuestionId',q->'points') FROM jsonb_array_elements(v.snapshot->'questions') q),'{}'::jsonb),
 'versionCount',(SELECT count(*) FROM assessment_versions av WHERE av.assessment_id=a.id),
 'paper',COALESCE(v.snapshot#>>'{render,paper}','A4'),
 'template',COALESCE(v.snapshot#>>'{render,template}','basicexam-v1'),
 'font',COALESCE(v.snapshot#>>'{render,font}','plex'),
 'fontSize',COALESCE(v.snapshot#>'{render,fontSize}','11'::jsonb),
 'showBnccSkills',COALESCE(v.snapshot#>'{render,showBnccSkills}','false'::jsonb),
 'showSaebDescriptors',COALESCE(v.snapshot#>'{render,showSaebDescriptors}','false'::jsonb),
 'instructions',COALESCE(v.snapshot#>'{assessment,instructions}','[]'::jsonb),
 'shuffleQuestions',false),
 a.id,a.created_at,a.created_at
FROM assessments a
JOIN LATERAL (SELECT snapshot FROM assessment_versions WHERE assessment_id=a.id ORDER BY code LIMIT 1) v ON true
WHERE NOT EXISTS(SELECT 1 FROM assessment_workspaces w WHERE w.assessment_id=a.id);
