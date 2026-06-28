/**
 * 数据库客户端模块
 * 统一导出 Supabase 客户端实例
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.COZE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Key not configured')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
