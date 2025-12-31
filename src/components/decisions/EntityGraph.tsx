import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Network,
  FileText,
  User,
  Building2,
  ShoppingCart,
  CreditCard,
  Package,
  Filter,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDecisionTraces, useDecisionEntities } from "@/hooks/useDecisionLedger";

interface GraphNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

const entityTypeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  vendor: { icon: Building2, color: "#3b82f6" },
  customer: { icon: User, color: "#10b981" },
  purchase_order: { icon: ShoppingCart, color: "#f59e0b" },
  payment_run: { icon: CreditCard, color: "#8b5cf6" },
  invoice: { icon: FileText, color: "#ec4899" },
  product: { icon: Package, color: "#06b6d4" },
  decision: { icon: FileText, color: "#6b7280" },
};

function SimpleGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const width = 800;
  const height = 500;

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        <div className="text-center">
          <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No entity relationships to display</p>
          <p className="text-sm mt-1">Entities will appear as decisions are made</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 flex gap-2 z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setZoom(Math.min(2, zoom + 0.2))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
      
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="bg-muted/30 rounded-lg"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
      >
        {/* Draw edges */}
        {edges.map((edge, idx) => {
          const source = nodes.find((n) => n.id === edge.source);
          const target = nodes.find((n) => n.id === edge.target);
          if (!source || !target) return null;
          
          return (
            <g key={idx}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="hsl(var(--border))"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
              {edge.label && (
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 5}
                  textAnchor="middle"
                  className="text-xs fill-muted-foreground"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="hsl(var(--border))"
            />
          </marker>
        </defs>

        {/* Draw nodes */}
        {nodes.map((node) => {
          const config = entityTypeConfig[node.type] || entityTypeConfig.decision;
          const Icon = config.icon;
          const isSelected = selectedNode === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => setSelectedNode(isSelected ? null : node.id)}
              className="cursor-pointer"
            >
              <circle
                r={isSelected ? 28 : 24}
                fill={config.color}
                opacity={0.2}
                stroke={config.color}
                strokeWidth={isSelected ? 3 : 2}
              />
              <circle
                r={16}
                fill={config.color}
              />
              <foreignObject x="-8" y="-8" width="16" height="16">
                <div className="flex items-center justify-center h-full">
                  <Icon className="h-4 w-4 text-white" />
                </div>
              </foreignObject>
              <text
                y={35}
                textAnchor="middle"
                className="text-xs font-medium fill-foreground"
              >
                {node.label.length > 15 ? node.label.slice(0, 15) + "..." : node.label}
              </text>
              <text
                y={48}
                textAnchor="middle"
                className="text-xs fill-muted-foreground"
              >
                {node.type}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-background border rounded-lg p-3 shadow-lg max-w-xs">
          <div className="font-medium">
            {nodes.find((n) => n.id === selectedNode)?.label}
          </div>
          <div className="text-sm text-muted-foreground">
            Type: {nodes.find((n) => n.id === selectedNode)?.type}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ID: {selectedNode.slice(0, 8)}...
          </div>
        </div>
      )}
    </div>
  );
}

export function EntityGraph() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data: decisions } = useDecisionTraces({ limit: 50 });

  // Build graph from decisions and their entities
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];

    if (!decisions) return { nodes: [], edges: [] };

    // Filter decisions
    const filteredDecisions = typeFilter === "all" 
      ? decisions 
      : decisions.filter((d) => d.decision_type === typeFilter);

    // Position calculation - circular layout
    const centerX = 400;
    const centerY = 250;
    const radius = 180;

    filteredDecisions.slice(0, 10).forEach((decision, idx) => {
      const angle = (2 * Math.PI * idx) / Math.min(filteredDecisions.length, 10);
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Add decision node
      const decisionNodeId = `decision-${decision.id}`;
      nodeMap.set(decisionNodeId, {
        id: decisionNodeId,
        type: "decision",
        label: decision.decision_type.replace(/_/g, " "),
        x,
        y,
        color: "#6b7280",
      });

      // Extract entities from input_snapshot
      const snapshot = decision.input_snapshot as Record<string, unknown>;
      
      if (snapshot.vendor_name) {
        const vendorId = `vendor-${snapshot.vendor_name}`;
        if (!nodeMap.has(vendorId)) {
          const vendorAngle = angle + 0.3;
          nodeMap.set(vendorId, {
            id: vendorId,
            type: "vendor",
            label: String(snapshot.vendor_name),
            x: centerX + (radius + 80) * Math.cos(vendorAngle),
            y: centerY + (radius + 80) * Math.sin(vendorAngle),
            color: "#3b82f6",
          });
        }
        edgeList.push({ source: decisionNodeId, target: vendorId, label: "involves" });
      }

      if (snapshot.po_number) {
        const poId = `po-${snapshot.po_number}`;
        if (!nodeMap.has(poId)) {
          const poAngle = angle - 0.3;
          nodeMap.set(poId, {
            id: poId,
            type: "purchase_order",
            label: String(snapshot.po_number),
            x: centerX + (radius + 80) * Math.cos(poAngle),
            y: centerY + (radius + 80) * Math.sin(poAngle),
            color: "#f59e0b",
          });
        }
        edgeList.push({ source: decisionNodeId, target: poId, label: "affects" });
      }
    });

    return {
      nodes: Array.from(nodeMap.values()),
      edges: edgeList,
    };
  }, [decisions, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {nodes.length} nodes, {edges.length} relationships
          </span>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="po_approval">PO Approvals</SelectItem>
            <SelectItem value="payment_approval">Payments</SelectItem>
            <SelectItem value="requisition_approval">Requisitions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SimpleGraph nodes={nodes} edges={edges} />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        {Object.entries(entityTypeConfig).map(([type, config]) => {
          const Icon = config.icon;
          return (
            <div key={type} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span className="capitalize">{type.replace(/_/g, " ")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}