import { Component } from 'react';

// 모바일에서 콘솔 없이 render 에러를 화면에 직접 표시
export class RenderErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[api-status] render error:', error, info);
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-[10px] text-rose-200 font-mono break-all whitespace-pre-wrap leading-relaxed">
          ⚠ render error{"\n"}
          {String(e?.message || e)}{"\n\n"}
          {String(e?.stack || '').slice(0, 1500)}
        </div>
      );
    }
    return this.props.children;
  }
}
