"use client";

import { useEffect, useRef } from "react";
import { area, line, curveMonotoneX, scaleLinear, select } from "d3";

interface SparklineProps {
  id: string;
  values: number[];
}

// Small filled line chart. Ported from UI._spark (d3 line/area + gradient fill).
export function Sparkline({ id, values }: SparklineProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = select(ref.current);
    svg.selectAll("*").remove();
    const W = 600,
      H = 70;
    if (!values || values.length < 2) {
      svg
        .append("text")
        .attr("x", 8)
        .attr("y", 38)
        .attr("fill", "#6b739a")
        .attr("font-size", 12)
        .text("Not enough data yet.");
      return;
    }
    const max = Math.max(...values, 1),
      min = Math.min(...values, 0);
    const x = scaleLinear()
      .domain([0, values.length - 1])
      .range([4, W - 4]);
    const y = scaleLinear().domain([min, max]).range([H - 6, 6]);
    const lineGen = line<number>()
      .x((_d, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);
    const areaGen = area<number>()
      .x((_d, i) => x(i))
      .y0(H)
      .y1((d) => y(d))
      .curve(curveMonotoneX);
    const gradId = id + "-grad";
    const defs = svg.append("defs");
    const lg = defs
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 1);
    lg.append("stop").attr("offset", "0%").attr("stop-color", "#6ee7ff").attr("stop-opacity", 0.35);
    lg.append("stop").attr("offset", "100%").attr("stop-color", "#6ee7ff").attr("stop-opacity", 0);
    svg.append("path").attr("d", areaGen(values) || "").attr("fill", `url(#${gradId})`);
    svg
      .append("path")
      .attr("d", lineGen(values) || "")
      .attr("fill", "none")
      .attr("stroke", "#6ee7ff")
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round");
  }, [id, values]);

  return <svg className="spark" id={id} ref={ref} viewBox="0 0 600 70" preserveAspectRatio="none" />;
}
