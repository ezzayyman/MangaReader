type DownloadState = {
  active: boolean;
  title?: string;
  progress: number; // 0-100
  message?: string;
};

class DownloadManager {
  private listeners: Set<(s: DownloadState) => void> = new Set();
  private state: DownloadState = { active: false, progress: 0 };

  subscribe(listener: (s: DownloadState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setState(next: DownloadState) {
    this.state = next;
    this.listeners.forEach(fn => fn(this.state));
  }

  start(title: string, message?: string) {
    this.setState({ active: true, title, progress: 0, message });
  }

  update(progress: number, message?: string) {
    this.setState({ ...this.state, active: true, progress: Math.max(0, Math.min(100, progress)), message });
  }

  complete(message?: string) {
    this.setState({ active: false, progress: 100, title: this.state.title, message });
  }

  fail(message?: string) {
    this.setState({ active: false, progress: 0, title: this.state.title, message });
  }
}

const downloadManager = new DownloadManager();
export type { DownloadState };
export default downloadManager;
