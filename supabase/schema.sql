-- 將建表、權限與政策放在同一筆交易中，讓設定一併生效。
BEGIN;

-- 建立報修登記表。識別碼、登記時間及初始處理狀態由資料庫產生。
CREATE TABLE public.repair_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    reporter_name text NOT NULL,
    location text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    urgency text NOT NULL DEFAULT '中',
    status text NOT NULL DEFAULT '待處理',

    -- CHECK：限制選項值，適用於所有寫入資料的角色。
    CONSTRAINT repair_requests_category_check
        CHECK (category IN ('設備', '網路', '環境', '其他')),
    CONSTRAINT repair_requests_urgency_check
        CHECK (urgency IN ('低', '中', '高')),
    CONSTRAINT repair_requests_status_check
        CHECK (status IN ('待處理', '處理中', '已完成')),

    -- CHECK：依字元數限制文字長度，並要求至少有一個非空白字元。
    CONSTRAINT repair_requests_reporter_name_check
        CHECK (char_length(reporter_name) BETWEEN 1 AND 100 AND reporter_name ~ '[^[:space:]]'),
    CONSTRAINT repair_requests_location_check
        CHECK (char_length(location) BETWEEN 1 AND 200 AND location ~ '[^[:space:]]'),
    CONSTRAINT repair_requests_description_check
        CHECK (char_length(description) BETWEEN 1 AND 2000 AND description ~ '[^[:space:]]')
);

-- GRANT：撤銷可能由預設權限授予 API 角色及 PUBLIC 的表級權限。
REVOKE ALL PRIVILEGES ON TABLE public.repair_requests FROM PUBLIC, anon, authenticated, service_role;

-- GRANT：只授予 anon 讀取權限，以及表單可填欄位的新增權限。
-- id、created_at、status 由資料庫套用預設值，前端送出時應省略這三個欄位。
GRANT SELECT ON TABLE public.repair_requests TO anon;
GRANT INSERT (reporter_name, location, category, description, urgency)
    ON TABLE public.repair_requests TO anon;

-- RLS：啟用資料列安全，允許匿名訪客讀取所有報修資料。
ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY repair_requests_anon_select
    ON public.repair_requests
    FOR SELECT
    TO anon
    USING (true);

-- RLS：只接受狀態為「待處理」的新資料列，不建立修改或刪除政策。
CREATE POLICY repair_requests_anon_insert
    ON public.repair_requests
    FOR INSERT
    TO anon
    WITH CHECK (status = '待處理');

-- 完成建表與安全設定。
COMMIT;
