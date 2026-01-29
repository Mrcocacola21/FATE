import React, { useEffect, useRef, useState } from "react";

const WIDTH = 800;
const HEIGHT = 450;

type PongState = {
  tick: number;
  phase: string;
  width: number;
  height: number;
  paddles: { P1: { x:number;y:number;w:number;h:number }; P2: { x:number;y:number;w:number;h:number } };
  ball: { x:number;y:number;vx:number;vy:number;r:number };
  score: { P1:number; P2:number };
};

export function Heartbreak() {
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<"P1"|"P2"|"spectator">("spectator");
  const [roomId, setRoomId] = useState("heart-1");
  const [ws, setWs] = useState<WebSocket| null>(null);
  const [state, setState] = useState<PongState|null>(null);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);

  useEffect(() => {
    const socketUrl = (import.meta.env.VITE_WS_URL ?? window.location.origin.replace(/^http/, 'ws')) + '/ws';
    if (!ws) return;
    return () => { ws.close(); };
  }, [ws]);

  useEffect(() => {
    if (!state) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    // clear
    ctx.clearRect(0,0,c.width,c.height);
    // background
    ctx.fillStyle = '#111'; ctx.fillRect(0,0,c.width,c.height);
    // paddles
    ctx.fillStyle = '#fff';
    const scaleX = c.width / WIDTH;
    const scaleY = c.height / HEIGHT;
    const s = Math.min(scaleX, scaleY);
    const ox = (c.width - WIDTH*s)/2;
    const oy = (c.height - HEIGHT*s)/2;
    const drawRect = (x:number,y:number,w:number,h:number) => ctx.fillRect(ox + x*s - (w*s)/2, oy + y*s - (h*s)/2, w*s, h*s);
    drawRect(state.paddles.P1.x, state.paddles.P1.y, state.paddles.P1.w, state.paddles.P1.h);
    drawRect(state.paddles.P2.x, state.paddles.P2.y, state.paddles.P2.w, state.paddles.P2.h);
    // ball
    ctx.beginPath(); ctx.arc(ox + state.ball.x*s, oy + state.ball.y*s, state.ball.r*s, 0, Math.PI*2); ctx.fill();
    // score
    ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText(`${state.score.P1} - ${state.score.P2}`, 10, 30);
  }, [state]);

  function connect() {
    const socketUrl = (import.meta.env.VITE_WS_URL ?? window.location.origin.replace(/^http/, 'ws')) + '/ws';
    const socket = new WebSocket(socketUrl);
    socket.onopen = () => { setConnected(true); setWs(socket); };
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'pongState') {
          setState(msg.state);
        }
      } catch {}
    };
    socket.onclose = () => { setConnected(false); setWs(null); };
  }

  function join() {
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'pongJoin', roomId, role }));
  }

  function start() { if (!ws) return; ws.send(JSON.stringify({ type: 'pongStart' })); }
  function reset() { if (!ws) return; ws.send(JSON.stringify({ type: 'pongReset' })); }
  function sendInput(dir: 'up'|'down'|'stop') { if (!ws) return; ws.send(JSON.stringify({ type: 'pongInput', dir })); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!ws) return;
      if (e.type === 'keydown') {
        if (e.key === 'w' || e.key === 'ArrowUp') sendInput('up');
        if (e.key === 's' || e.key === 'ArrowDown') sendInput('down');
      } else if (e.type === 'keyup') {
        if (['w','s','ArrowUp','ArrowDown'].includes(e.key)) sendInput('stop');
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, [ws]);

  return (
    <div style={{display:'flex',gap:12}}>
      <div>
        <div>Heartbreak (Ping-Pong)</div>
        <div>Role: <select value={role} onChange={e=>setRole(e.target.value as any)}><option value='P1'>P1</option><option value='P2'>P2</option><option value='spectator'>spectator</option></select></div>
        <div>Room: <input value={roomId} onChange={e=>setRoomId(e.target.value)} /></div>
        <div>
          {!connected ? <button onClick={connect}>Connect</button> : <button onClick={()=>{ ws?.close(); }}>Disconnect</button>}
          <button onClick={join} disabled={!connected}>Join</button>
          <button onClick={start} disabled={!connected}>Start</button>
          <button onClick={reset} disabled={!connected}>Reset</button>
        </div>
        <div style={{marginTop:8}}>Use W/S or ↑/↓ to move. Score shown on canvas.</div>
      </div>
      <div>
        <canvas ref={canvasRef} width={800} height={450} style={{border:'1px solid #333', width:800/2, height:450/2}} />
      </div>
    </div>
  );
}
