-- Media buckets, one per category the app stores, all private.
--
-- A private bucket has no public URL: the app reads media through a short-lived
-- signed URL (`createSignedUrl`) and writes through the signed-in session, so
-- access always follows the app's own permissions.
--
-- The stored reference for a file is `bucket/path` (for example
-- `beam-images/<session>/<name>.jpg`), which is what beam_media.file_uri holds.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('beam-images',  'beam-images',  false, 26214400),
  ('beam-videos',  'beam-videos',  false, 262144000),
  ('avatars',      'avatars',      false, 5242880),
  ('attachments',  'attachments',  false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- Every bucket follows the same rule: signed-in people read, and they write
-- only inside their own folder (the first path segment is their profile id).
drop policy if exists beam_media_read on storage.objects;
create policy beam_media_read on storage.objects
  for select to authenticated
  using (bucket_id in ('beam-images', 'beam-videos', 'avatars', 'attachments'));

drop policy if exists beam_media_write on storage.objects;
create policy beam_media_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('beam-images', 'beam-videos', 'avatars', 'attachments')
    and (storage.foldername(name))[1] = public.current_profile_id()
  );

drop policy if exists beam_media_update on storage.objects;
create policy beam_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('beam-images', 'beam-videos', 'avatars', 'attachments')
    and (storage.foldername(name))[1] = public.current_profile_id()
  )
  with check (
    bucket_id in ('beam-images', 'beam-videos', 'avatars', 'attachments')
    and (storage.foldername(name))[1] = public.current_profile_id()
  );

drop policy if exists beam_media_delete on storage.objects;
create policy beam_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('beam-images', 'beam-videos', 'avatars', 'attachments')
    and (storage.foldername(name))[1] = public.current_profile_id()
  );
