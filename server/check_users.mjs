import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || 'https://br-slick-peep-6b368f8f.supabase2.aidap-global.cn-beijing.volces.com';
const SUPABASE_SERVICE_ROLE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 查询 auth.users
const { data: authUsers, error: authError } = await sb.auth.admin.listUsers();
console.log('=== auth.users ===');
if (authError) console.log('Error:', authError.message);
else console.log(JSON.stringify(authUsers?.users?.map(u => ({id: u.id, email: u.email, phone: u.phone})), null, 2));

// 查询 profiles
const { data: profiles, error: profilesError } = await sb.from('profiles').select('id, phone, email');
console.log('\n=== profiles ===');
if (profilesError) console.log('Error:', profilesError.message);
else console.log(JSON.stringify(profiles, null, 2));

// 查询 number_votes 的 user_id
const { data: votes, error: votesError } = await sb.from('number_votes').select('user_id, phone');
console.log('\n=== number_votes (distinct user_id) ===');
if (votesError) console.log('Error:', votesError.message);
else {
  const uniqueUserIds = [...new Set(votes.map(v => v.user_id))];
  console.log(JSON.stringify(uniqueUserIds, null, 2));
}
