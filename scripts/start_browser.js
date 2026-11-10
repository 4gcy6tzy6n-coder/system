// 启动本机 Chrome（独立 profile，CDP 端口 9333），打开两个教务系统页面供用户手动登录
// 用法: node scripts/start_browser.js   （启动后脚本退出，Chrome 独立运行）
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PROFILE = path.join(__dirname, '..', 'browser-profile');
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--no-default-browser-check',
  '--new-window',
  'http://zhjw.uibe.edu.cn/',
  'http://zhlb.uibe.edu.cn/',
];

const child = spawn(CHROME, args, { detached: true, stdio: 'ignore' });
child.unref();
console.log('Chrome launched, pid:', child.pid);

// 等 CDP 端口就绪
function waitCdp(retries = 40) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      http.get(`http://127.0.0.1:${PORT}/json/version`, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', () => {
        if (n <= 0) return reject(new Error('CDP not ready'));
        setTimeout(() => tryOnce(n - 1), 500);
      });
    };
    tryOnce(retries);
  });
}

waitCdp().then(info => {
  console.log('CDP ready:', info.Browser);
  console.log('请在弹出的 Chrome 窗口中登录 zhjw（教务综合）和 zhlb（智慧教学管理平台）');
}).catch(e => { console.error(e.message); process.exit(1); });
