// The app's client, now served by Supabase.
//
// Every page and hook imports `base44` from here; it keeps that name and shape
// (entities, auth, functions, integrations) but talks to the Supabase project
// instead of the previous backend.
export { base44 } from './supabaseBackend';
export { supabase } from './supabaseClient';
