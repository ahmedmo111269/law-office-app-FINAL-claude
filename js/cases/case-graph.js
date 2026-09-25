import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';

const MAX_NODES = 80;
const MAX_EDGES = 120;
const MAX_NEIGHBORS_PER_NODE = 30;

const RELATION_LABELS = Object.freeze({
  original: 'أصلية',
  appeal: 'استئناف',
  cassation: 'نقض',
  related: 'مرتبطة',
  counterclaim: 'دعوى فرعية/مقابلة',
  intervention: 'تدخل',
  grievance: 'تظلم',
  other: 'أخرى'
});

function displayCase(row) {
  return `${row?.caseNumber || '—'} / ${row?.caseYear || '—'}`;
}

async function getRelations(caseId) {
  const [outgoing, incoming] = await Promise.all([
    repo(STORES.caseRelations).byIndex('sourceCaseId', Number(caseId), { limit: MAX_NEIGHBORS_PER_NODE }),
    repo(STORES.caseRelations).byIndex('targetCaseId', Number(caseId), { limit: MAX_NEIGHBORS_PER_NODE })
  ]);
  return [...outgoing, ...incoming];
}

async function getCase(id) {
  return repo(STORES.cases).get(Number(id));
}

/**
 * Builds a bounded case graph. It intentionally does not recursively scan the
 * whole database: only the selected case plus up to two relation hops are read.
 */
export async function buildCaseGraph(rootCaseId, { depth = 2, maxNodes = MAX_NODES } = {}) {
  const root = await getCase(rootCaseId);
  if (!root) return { rootId: Number(rootCaseId), nodes: [], edges: [], truncated: false };

  const nodeLimit = Math.min(Math.max(Number(maxNodes) || MAX_NODES, 10), MAX_NODES);
  const nodes = new Map([[Number(root.id), { id: Number(root.id), depth: 0, case: root }]]);
  const edges = [];
  const visitedDepth = new Map([[Number(root.id), 0]]);
  let frontier = [Number(root.id)];
  let truncated = false;

  for (let level = 0; level < Math.min(Number(depth) || 0, 3); level += 1) {
    if (!frontier.length) break;
    const next = [];

    for (const currentId of frontier) {
      const relations = await getRelations(currentId);
      for (const relation of relations) {
        const sourceId = Number(relation.sourceCaseId);
        const targetId = Number(relation.targetCaseId);
        const neighborId = sourceId === currentId ? targetId : sourceId;
        if (!neighborId || neighborId === currentId) continue;

        const existingEdge = edges.some(edge =>
          edge.sourceId === sourceId &&
          edge.targetId === targetId &&
          edge.relationType === relation.relationType
        );
        if (!existingEdge) {
          if (edges.length >= MAX_EDGES) {
            truncated = true;
          } else {
            edges.push({
              id: relation.id,
              sourceId,
              targetId,
              relationType: relation.relationType || 'related',
              label: RELATION_LABELS[relation.relationType] || relation.relationType || 'مرتبطة',
              notes: relation.notes || ''
            });
          }
        }

        const nextDepth = level + 1;
        const previousDepth = visitedDepth.get(neighborId);
        if (previousDepth !== undefined && previousDepth <= nextDepth) continue;

        if (nodes.size >= nodeLimit) {
          truncated = true;
          continue;
        }

        const neighbor = await getCase(neighborId);
        if (!neighbor) continue;
        nodes.set(neighborId, { id: neighborId, depth: nextDepth, case: neighbor });
        visitedDepth.set(neighborId, nextDepth);
        next.push(neighborId);
      }
    }

    frontier = [...new Set(next)];
  }

  return {
    rootId: Number(root.id),
    nodes: [...nodes.values()].map(item => ({
      id: item.id,
      depth: item.depth,
      displayNumber: displayCase(item.case),
      subject: item.case.subject || '',
      caseType: item.case.caseType || '',
      degree: item.case.degree || '',
      status: item.case.status || '',
      archived: !!item.case.archived
    })),
    edges,
    truncated
  };
}

export function renderCaseGraph(graph, escapeHtml) {
  if (!graph?.nodes?.length) {
    return '<div class="empty"><strong>لا توجد بيانات كافية لبناء خريطة العلاقات.</strong><span>أضف علاقة بين القضايا أولًا.</span></div>';
  }

  const rootId = Number(graph.rootId);
  const columns = graph.nodes.reduce((map, node) => {
    const key = Math.min(Number(node.depth) || 0, 2);
    if (!map[key]) map[key] = [];
    map[key].push(node);
    return map;
  }, {});

  const nodeHtml = node => `
    <a class="case-graph-node ${node.id === rootId ? 'is-root' : ''} ${node.archived ? 'is-archived' : ''}" href="#/cases?id=${encodeURIComponent(node.id)}&view=360">
      <strong>${escapeHtml(node.displayNumber)}</strong>
      <span>${escapeHtml(node.subject || 'بدون موضوع')}</span>
      <small>${escapeHtml(node.relationLabel || '')}</small>
    </a>`;

  const edgeHtml = graph.edges.map(edge => `
    <div class="case-graph-edge" title="${escapeHtml(edge.notes || '')}">
      <span>${escapeHtml(edge.label)}</span>
    </div>`).join('');

  return `
    <div class="case-graph-wrap">
      <div class="case-graph-toolbar">
        <span class="muted">العقد: ${graph.nodes.length} · العلاقات: ${graph.edges.length}</span>
        ${graph.truncated ? '<span class="notice-inline">تم إيقاف التوسع عند الحد الآمن للعرض.</span>' : ''}
      </div>
      <div class="case-graph-canvas" role="list" aria-label="خريطة علاقات القضايا">
        <div class="case-graph-column depth-0">${(columns[0] || []).map(nodeHtml).join('')}</div>
        <div class="case-graph-column depth-1">${(columns[1] || []).map(nodeHtml).join('')}</div>
        <div class="case-graph-column depth-2">${(columns[2] || []).map(nodeHtml).join('')}</div>
      </div>
      ${edgeHtml ? `<details class="case-graph-relations"><summary>تفاصيل العلاقات (${graph.edges.length})</summary><div class="case-graph-edge-list">${edgeHtml}</div></details>` : ''}
    </div>`;
}
