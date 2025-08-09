// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mzterpudatyaxnmealzf.supabase.co'; // ضع رابط Supabase هنا
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dGVycHVkYXR5YXhubWVhbHpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0NTUzOTIsImV4cCI6MjA2OTAzMTM5Mn0.9RbzXg6g8Ah7Aj2MRrcb6AAvotJf3lTcNfpv__xmuNA'; // ضع مفتاح anon من إعدادات Supabase

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
