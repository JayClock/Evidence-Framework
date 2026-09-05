import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import styles from './app.module.css';

type HelloResponse = {
  message: string;
  service: string;
};

function Home() {
  const [status, setStatus] = useState('正在连接 Java 后端…');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let retryId: number | undefined;

    async function loadStatus() {
      try {
        const response = await fetch('/api/hello', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as HelloResponse;
        setStatus(`${data.message} (${data.service})`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setStatus('后端未启动，正在重试…');
      } finally {
        if (active) {
          retryId = window.setTimeout(() => void loadStatus(), 5_000);
        }
      }
    }

    void loadStatus();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(retryId);
    };
  }, []);

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <span className={styles.badge}>Nx Monorepo</span>
        <h1>React + Java Monorepo</h1>
        <p>前端使用 React 和 Vite，后端使用 Spring Boot 和 Gradle。</p>
        <div className={styles.status}>
          <strong>API 状态</strong>
          <span>{status}</span>
        </div>
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
