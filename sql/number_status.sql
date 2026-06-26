-- Number Status Sharing Architecture
-- 号码状态共享池架构

-- 1. 创建 number_status 表
CREATE TABLE IF NOT EXISTS number_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_hash TEXT NOT NULL, -- SHA-256 哈希后的号码
  status TEXT NOT NULL CHECK (status IN ('normal', 'stopped', 'suspected_stopped')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone_hash, user_id) -- 每个用户对同一号码只能有一个标记
);

-- 2. 添加索引
CREATE INDEX IF NOT EXISTS idx_number_status_phone_hash ON number_status(phone_hash);
CREATE INDEX IF NOT EXISTS idx_number_status_user_id ON number_status(user_id);
CREATE INDEX IF NOT EXISTS idx_number_status_status ON number_status(status);

-- 3. RLS 策略
ALTER TABLE number_status ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的标记
CREATE POLICY "Users can view own marks" ON number_status
  FOR SELECT USING (auth.uid() = user_id);

-- 用户可以插入自己的标记
CREATE POLICY "Users can insert own marks" ON number_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户可以更新自己的标记
CREATE POLICY "Users can update own marks" ON number_status
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户可以删除自己的标记
CREATE POLICY "Users can delete own marks" ON number_status
  FOR DELETE USING (auth.uid() = user_id);

-- 4. 信任分数字段 (添加到用户表或通过函数计算)
-- 信任分数初始 10 分，每次错误标记 -1 分，0 分时禁用标记功能
CREATE OR REPLACE FUNCTION get_user_trust_score(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 10; -- 初始分数
  v_bad_marks INTEGER;
BEGIN
  -- 计算被其他用户纠正的错误标记数
  SELECT COUNT(*) INTO v_bad_marks
  FROM number_status ns1
  WHERE ns1.user_id = p_user_id
    AND ns1.status = 'stopped'
    AND EXISTS (
      SELECT 1 FROM number_status ns2
      WHERE ns2.phone_hash = ns1.phone_hash
        AND ns2.user_id != p_user_id
        AND ns2.status = 'normal'
        AND ns2.created_at > ns1.created_at
    );
  
  v_score := v_score - (v_bad_marks * 1);
  RETURN GREATEST(v_score, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 检查用户是否可以标记 (信任分 > 0)
CREATE OR REPLACE FUNCTION can_user_mark(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_trust_score(p_user_id) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 获取社区共识标记 (至少 2 人标记相同状态)
CREATE OR REPLACE FUNCTION get_community_status(p_phone_hash TEXT)
RETURNS TABLE (
  status TEXT,
  mark_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT ns.status, COUNT(*)::INTEGER as mark_count
  FROM number_status ns
  WHERE ns.phone_hash = p_phone_hash
  GROUP BY ns.status
  HAVING COUNT(*) >= 2 -- 共识阈值：至少 2 人
  ORDER BY COUNT(*) DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 自动更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_number_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_number_status_updated_at
  BEFORE UPDATE ON number_status
  FOR EACH ROW
  EXECUTE FUNCTION update_number_status_updated_at();

-- 8. 批量获取所有社区共识标记 (高效，一次调用获取全部)
CREATE OR REPLACE FUNCTION get_all_community_statuses()
RETURNS TABLE (
  phone_hash TEXT,
  status TEXT,
  mark_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT ns.phone_hash, ns.status, COUNT(*)::INTEGER as mark_count
  FROM number_status ns
  GROUP BY ns.phone_hash, ns.status
  HAVING COUNT(*) >= 2 -- 共识阈值：至少 2 人
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 清理过期数据 (可选，定期执行)
-- DELETE FROM number_status WHERE updated_at < NOW() - INTERVAL '90 days';
