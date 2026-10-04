import type { RefObject } from 'react';
import type { Participant } from '../types';

type Props = { participants: Participant[]; rotorRef: RefObject<HTMLDivElement | null>; winnerId: string | null; onTransitionEnd: () => void };
const COLORS = ['#8F111C', '#EBC45F', '#B72631', '#FFF0BF'];
const point = (angle: number, radius: number) => ({ x: 360 + radius * Math.sin(angle * Math.PI / 180), y: 360 - radius * Math.cos(angle * Math.PI / 180) });
export default function Wheel({ participants, rotorRef, winnerId, onTransitionEnd }: Props) {
  const angle = 360 / Math.max(participants.length, 1), step = Math.max(1, Math.ceil(participants.length / 32));
  return <div className="wheel-shell">
    <div className="wheel-pointer" aria-hidden="true" />
    <div className="wheel-rotor" ref={rotorRef} onTransitionEnd={event => { if (event.propertyName === 'transform') onTransitionEnd(); }}>
      <svg viewBox="0 0 720 720" role="img" aria-label={`可抽名單 ${participants.length} 人的轉盤`}>
        <circle cx="360" cy="360" r="334" fill="#D9A441" />
        {participants.length === 0 && <circle cx="360" cy="360" r="318" fill="#FFF0BF" />}
        {participants.map((person, index) => {
          const start = point(index * angle, 318), end = point((index + 1) * angle, 318), mid = (index + .5) * angle;
          const pos = point(mid, participants.length <= 12 ? 228 : 248), winner = winnerId === person.id, label = person.code || person.label;
          return <g key={person.id}>
            {participants.length === 1 ? <circle cx="360" cy="360" r="318" fill={COLORS[0]} /> : <path d={`M360 360 L${start.x} ${start.y} A318 318 0 ${angle > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`} fill={winner ? '#FFF6D4' : COLORS[index % 4]} stroke="#D9A441" strokeWidth="1.5" />}
            {index % step === 0 && <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" fontSize={participants.length <= 12 ? 28 : participants.length <= 40 ? 22 : 17} fill={winner || index % 2 ? '#5C0B11' : '#FFF9E9'} fontWeight="800" transform={`rotate(${mid > 90 && mid < 270 ? mid + 180 : mid} ${pos.x} ${pos.y})`}>{label.length > 8 ? `${label.slice(0, 8)}…` : label}</text>}
          </g>;
        })}
      </svg>
    </div>
    <img className="wheel-art-frame" src={`${import.meta.env.BASE_URL}assets/wheel-frame.png`} alt="" />
    <div className="wheel-center"><img src={`${import.meta.env.BASE_URL}assets/wheel-center.png`} alt="" /><span>福</span></div>
  </div>;
}
