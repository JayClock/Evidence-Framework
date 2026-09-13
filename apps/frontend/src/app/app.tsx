import { Link, Route, Routes } from 'react-router-dom';
import styles from './app.module.css';

function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <span className={styles.badge}>User API</span>
        <h1>用户资料</h1>
        <p>当前提供稳定用户 ID 与显示名称的创建、查询、修改和删除 API。</p>
        <a href="/api/users">查看用户 API</a>
      </section>
    </main>
  );
}

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Link to="/">Evidence PoC</Link>
      </header>
      <Routes>
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}

export default App;
