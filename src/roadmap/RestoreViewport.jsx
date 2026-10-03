import { useEffect, useRef } from 'react';
import { useNodesInitialized, useReactFlow, useStore } from '@xyflow/react';

export default function RestoreViewport() {
  const initialized = useNodesInitialized();
  const checked = useRef(false);
  const flow = useReactFlow();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  useEffect(() => {
    if (!initialized || !width || !height || checked.current) return;
    checked.current = true;
    const viewport = flow.getViewport();
    const visible = flow.getNodes().some(node => {
      const left = node.position.x * viewport.zoom + viewport.x;
      const top = node.position.y * viewport.zoom + viewport.y;
      return left < width && top < height && left + node.measured.width * viewport.zoom > 0 && top + node.measured.height * viewport.zoom > 0;
    });
    if (!visible) void flow.fitView({ padding: .18, duration: 0 });
  }, [initialized, width, height, flow]);
  return null;
}
