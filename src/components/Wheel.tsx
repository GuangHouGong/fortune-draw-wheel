type WheelProps = {
  participants: string[];
  rotation: number;
  transition: string;
  winningId: string | null;
  isBusy: boolean;
  onStopAnimationEnd: () => void;
};

const WHEEL_SIZE = 720;
const CENTER = WHEEL_SIZE / 2;
const OUTER_RADIUS = 330;
const INNER_RADIUS = 86;
const LABEL_RADIUS = 254;
const SEGMENT_COLORS = ['#b90f1d', '#f8c94a', '#d72b17', '#ffe7a7', '#9f0d1b', '#f5a623'];

function polarPoint(radius: number, angleFromTop: number): { x: number; y: number } {
  const radians = (angleFromTop * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.sin(radians),
    y: CENTER - radius * Math.cos(radians),
  };
}

function segmentPath(startAngle: number, endAngle: number): string {
  const start = polarPoint(OUTER_RADIUS, startAngle);
  const end = polarPoint(OUTER_RADIUS, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function readableRotation(angleFromTop: number): number {
  const normalized = ((angleFromTop % 360) + 360) % 360;
  return normalized > 90 && normalized < 270 ? angleFromTop + 180 : angleFromTop;
}

export default function Wheel({
  participants,
  rotation,
  transition,
  winningId,
  isBusy,
  onStopAnimationEnd,
}: WheelProps) {
  const sliceAngle = participants.length > 0 ? 360 / participants.length : 360;
  const labelStep = participants.length <= 42 ? 1 : Math.ceil(participants.length / 42);
  const fontSize = participants.length <= 24 ? 28 : participants.length <= 60 ? 22 : 16;

  return (
    <div className="wheel-shell" aria-live="polite">
      <div className="wheel-pointer" aria-hidden="true">
        <span />
      </div>

      <div className="wheel-shadow">
        <div
          className="wheel-rotor"
          style={{ transform: `rotate(${rotation}deg)`, transition }}
          onTransitionEnd={(event) => {
            if (event.propertyName === 'transform') {
              onStopAnimationEnd();
            }
          }}
        >
          <svg
            className="wheel-svg"
            viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
            role="img"
            aria-label={`抽獎輪盤，共 ${participants.length} 個編號`}
          >
            <defs>
              <filter id="wheelInset" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#5a0708" floodOpacity="0.25" />
              </filter>
            </defs>

            <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 18} fill="#7c0b12" filter="url(#wheelInset)" />
            <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 8} fill="#f9d25f" />

            {participants.length === 0 ? (
              <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="#f7e7c0" />
            ) : (
              participants.map((participant, index) => {
                const startAngle = index * sliceAngle;
                const endAngle = (index + 1) * sliceAngle;
                const midAngle = startAngle + sliceAngle / 2;
                const label = polarPoint(LABEL_RADIUS, midAngle);
                const showLabel = index % labelStep === 0;
                const isWinner = participant === winningId;

                return (
                  <g key={`${participant}-${index}`}>
                    <path
                      d={segmentPath(startAngle, endAngle)}
                      fill={isWinner ? '#fff0a8' : SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                      stroke="#7f1013"
                      strokeWidth={isWinner ? 4 : 1.2}
                    />
                    {showLabel ? (
                      <text
                        x={label.x}
                        y={label.y}
                        className="wheel-label"
                        fontSize={fontSize}
                        transform={`rotate(${readableRotation(midAngle)} ${label.x} ${label.y})`}
                      >
                        {participant}
                      </text>
                    ) : null}
                  </g>
                );
              })
            )}

            <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS + 20} fill="#7c0b12" />
          </svg>
        </div>
        <div className="wheel-center-cap" aria-hidden="true">
          <span>福</span>
        </div>
      </div>

      <div className={`wheel-status ${isBusy ? 'is-busy' : ''}`}>
        {isBusy ? '轉動中' : `${participants.length} 位`}
      </div>
    </div>
  );
}
