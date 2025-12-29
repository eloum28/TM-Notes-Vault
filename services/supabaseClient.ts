import { createClient } from '@supabase/supabase-js';

// I added the missing single quotes (' ') around your keys below:
const supabaseUrl = 'https://ilayftvhiygukauffwym.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYXlmdHZoaXlndWthdWZmd3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjIyMzQsImV4cCI6MjA4MTg5ODIzNH0.PwUWGy_uLMrPiID52VjjqRspHkz6QnmfMv2vzL6lNLk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);