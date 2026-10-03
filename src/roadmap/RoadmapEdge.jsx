import React, { memo, useMemo } from 'react';
import { BaseEdge } from '@xyflow/react';
import { roundedPath, routeConnection } from './graph.js';

export default memo(function RoadmapEdge({ id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, style, data }) {
  const path = useMemo(() => roundedPath(routeConnection({ source, target, sourceX, sourceY, targetX, targetY,
    rectangles: data.rectangles, sourceLane: data.sourceLane, targetLane: data.targetLane })),
  [source, target, sourceX, sourceY, targetX, targetY, data.rectangles, data.sourceLane, data.targetLane]);
  return <>
    <title>{data.description}</title>
    <path d={path} fill="none" stroke="var(--bg)" strokeWidth={7} style={{ pointerEvents: 'none', opacity: style.opacity }} />
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={20} />
  </>;
});
