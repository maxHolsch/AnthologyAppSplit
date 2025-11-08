import { useEffect, useCallback, useRef } from 'react';
import * as d3 from 'd3';
import { useAnthologyStore } from '@stores';

export interface ZoomConfig {
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
}

/**
 * D3 zoom and pan behavior hook
 * Manages zoom/pan interactions and syncs with AnthologyStore
 */
export function useD3Zoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  containerRef: React.RefObject<SVGGElement | null>,
  config: ZoomConfig = {}
) {
  const {
    minZoom = 0.5,
    maxZoom = 3,
    initialZoom = 1
  } = config;

  const mapTransform = useAnthologyStore(state => state.view.mapTransform);
  const setMapTransform = useAnthologyStore(state => state.setMapTransform);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Initialize zoom behavior
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    const container = d3.select(containerRef.current);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, maxZoom])
      .on('zoom', (event) => {
        const { transform } = event;

        // Apply transform to container
        container.attr('transform', transform.toString());

        // Update store with new transform
        setMapTransform({
          x: transform.x,
          y: transform.y,
          k: transform.k
        });
      });

    // Apply zoom behavior to SVG
    svg.call(zoom);

    // Set initial transform to identity (no offset, scale 1)
    // Nodes are already centered by their initial positions
    const initialTransform = d3.zoomIdentity.scale(initialZoom);

    svg.call(zoom.transform, initialTransform);

    // Store zoom behavior reference
    zoomBehaviorRef.current = zoom;

    return () => {
      svg.on('.zoom', null);
    };
  }, [svgRef.current, containerRef.current, minZoom, maxZoom]);

  // Programmatic zoom to specific scale and position
  const zoomTo = useCallback((scale: number, x: number, y: number, duration: number = 750) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    const svg = d3.select(svgRef.current);
    const transform = d3.zoomIdentity
      .translate(x, y)
      .scale(Math.max(minZoom, Math.min(maxZoom, scale)));

    svg.transition()
      .duration(duration)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [minZoom, maxZoom]);

  // Zoom to fit specific bounds
  const zoomToBounds = useCallback((
    bounds: { x: number; y: number; width: number; height: number },
    padding: number = 50,
    duration: number = 750
  ) => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const svgRect = svg.getBoundingClientRect();

    // Calculate scale to fit bounds
    const scale = Math.min(
      (svgRect.width - padding * 2) / bounds.width,
      (svgRect.height - padding * 2) / bounds.height,
      maxZoom
    );

    // Calculate translation to center bounds
    const x = svgRect.width / 2 - (bounds.x + bounds.width / 2) * scale;
    const y = svgRect.height / 2 - (bounds.y + bounds.height / 2) * scale;

    zoomTo(scale, x, y, duration);
  }, [maxZoom, zoomTo]);

  // Center on specific node
  const centerOnNode = useCallback((
    nodeX: number,
    nodeY: number,
    targetScale?: number,
    duration: number = 750
  ) => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const svgRect = svg.getBoundingClientRect();
    const scale = targetScale || mapTransform.k;

    // Calculate translation to center node
    const x = svgRect.width / 2 - nodeX * scale;
    const y = svgRect.height / 2 - nodeY * scale;

    zoomTo(scale, x, y, duration);
  }, [mapTransform.k, zoomTo]);

  // Reset zoom to initial state
  const resetZoom = useCallback((duration: number = 750) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    const svg = d3.select(svgRef.current);
    const svgRect = svg.node()!.getBoundingClientRect();

    const transform = d3.zoomIdentity
      .translate(svgRect.width / 2, svgRect.height / 2)
      .scale(initialZoom);

    svg.transition()
      .duration(duration)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [initialZoom]);

  return {
    zoomTo,
    zoomToBounds,
    centerOnNode,
    resetZoom,
    currentTransform: mapTransform
  };
}
