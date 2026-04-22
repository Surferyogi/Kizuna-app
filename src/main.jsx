import React    from 'react'
import ReactDOM from 'react-dom/client'
import App      from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily:'sans-serif', padding:32, background:'#F8F5F1',
          minHeight:'100vh', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:16 }}>
          <p style={{ fontSize:32 }}>🌸</p>
          <p style={{ fontSize:18, fontWeight:700, color:'#5C3020', margin:0 }}>
            Kizuna could not start
          </p>
          <p style={{ fontSize:14, color:'#8C6050', margin:0, textAlign:'center', lineHeight:1.6 }}>
            {this.state.error.message}
          </p>
          <p style={{ fontSize:13, color:'#A08070', margin:0, textAlign:'center', lineHeight:1.6 }}>
            Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY<br/>
            are set as GitHub repository secrets.
          </p>
          <button onClick={() => window.location.reload()}
            style={{ marginTop:8, background:'#B8715C', color:'#fff', border:'none',
              borderRadius:12, padding:'12px 28px', fontSize:15, cursor:'pointer' }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
