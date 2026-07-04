// 入口文件：先加载 .env，再导入主应用
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 在任何其他模块导入之前加载 .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 现在导入主应用（此时环境变量已就绪）
import('./app.js');
