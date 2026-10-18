// Only normalize year labels for high school; elementary years are distinct.
export function normalizeTopicGrade(value, stage) {
  const text = String(value || '').trim();
  if (stage !== 'Ensino Médio') return text;
  const match = text.match(/^([123])\s*[ºª°oa]?\s*(?:ano|s[ée]rie)\b/i);
  return match ? `${match[1]}ª série` : text;
}

export function inheritedTopicGrade(topic, topics) {
  const seen = new Set();
  while (topic && !seen.has(topic.id)) {
    seen.add(topic.id);
    if (topic.grade_range) return topic.grade_range;
    topic = topics.find((item) => item.id === topic.parent_id);
  }
  return '';
}
