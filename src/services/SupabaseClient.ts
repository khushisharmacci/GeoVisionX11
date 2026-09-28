import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase URL and Anon Key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dfzopjddmevbttndacjc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmem9wamRkbWV2YnR0bmRhY2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDU0NTYsImV4cCI6MjEwNjE4MTQ1Nn0.j-tS6RBxJndiNPY5g81KDWEuCDu18-Q2KzoNa_mzJjA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);