-- 号码变更通知：本人标记集成投票系统
-- 给 number_votes 表新增 vote_type 字段，区分普通投票和本人标记

ALTER TABLE number_votes 
ADD COLUMN IF NOT EXISTS vote_type VARCHAR(20) DEFAULT 'normal';

-- vote_type 取值：
-- 'normal'    = 普通社区投票
-- 'self_mark' = 本人标记（号码变更通知产生的投票）

-- 索引：方便查询本人标记的投票
CREATE INDEX IF NOT EXISTS idx_number_votes_vote_type 
ON number_votes(vote_type) WHERE vote_type = 'self_mark';

-- 回填：将已有的 number_changes active 记录对应的投票标记为 self_mark
-- （如果 number_changes 表和对应投票记录存在的话）
UPDATE number_votes 
SET vote_type = 'self_mark'
WHERE vote_type IS NULL 
  AND (phone, user_id) IN (
    SELECT old_phone, publisher_id 
    FROM number_changes 
    WHERE status = 'active'
  );
