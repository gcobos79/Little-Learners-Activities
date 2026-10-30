-- V127: new activity type «Anagrama» (activity_type 'anagram'), like Wordwall's «Anagram»:
-- the child builds a word or phrase by dragging its mixed-up letters into the boxes.
-- Stored like the other types, no new tables:
--   quizzes.settings      = {"clues": true|false}   («Sin pistas» / «Con pistas», for the whole activity)
--   quiz_questions.prompt = the word or phrase
--   quiz_questions.read_text (+ read_text_enabled) = clue text
--   quiz_questions.image_path = clue picture
--   quiz_questions.audio_mode / audio_path = clue sound ('file' = recorded/uploaded sound,
--                                             'voice' = the voice reads the clue text)
--   quiz_result_answers.points / errors = points and letters dropped in the wrong box
alter table public.quizzes drop constraint if exists quizzes_activity_type_check;
alter table public.quizzes add constraint quizzes_activity_type_check check (activity_type in ('quiz', 'sort', 'typing', 'anagram'));

-- save_quiz: accept 'anagram' (same function, only the list of known types grows).
do $do$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.save_quiz(jsonb,jsonb,jsonb)'::regprocedure);
  if position('''anagram''' in v_def) = 0 then
    v_def := replace(v_def, 'in (''sort'', ''typing'')', 'in (''sort'', ''typing'', ''anagram'')');
    execute v_def;
  end if;
end $do$;
