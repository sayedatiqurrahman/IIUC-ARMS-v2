'use client';
import { useEffect, useState, useMemo } from 'react';
import { resolveDepartment, findDepartment } from '@/lib/departments';

export interface FacultyMember {
  id: string;
  name: string;
  title: string | null;
  shortForm: string | null;
  email?: string | null;
  department: string;
  memberType?: string;
}

// Cache the faculty list app-wide so many autocomplete instances (e.g. one per
// exam course cell) don't each fire their own request. Staff are excluded — only
// memberType "faculty" is ever returned for teacher selection.
let cached: FacultyMember[] | null = null;
let inflight: Promise<FacultyMember[]> | null = null;

function loadAllFaculty(): Promise<FacultyMember[]> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/faculty?memberType=faculty')
      .then(r => r.json())
      .then(d => {
        cached = (d.members || []) as FacultyMember[];
        return cached;
      })
      .catch(() => {
        cached = [];
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function deptShortName(dept: string): string {
  if (!dept) return '';
  const found = findDepartment(dept);
  return found?.department.shortName || dept.toUpperCase();
}

// Rank results so exact / prefix matches on the short form or name rise to the
// top — typing a teacher's short form shows them first.
function rankMember(m: FacultyMember, q: string): number {
  const ql = q.toLowerCase();
  const name = (m.name || '').toLowerCase();
  const sf = (m.shortForm || '').toLowerCase();
  if (sf && sf === ql) return 0;
  if (name === ql) return 1;
  if (sf && sf.startsWith(ql)) return 2;
  if (name.startsWith(ql)) return 3;
  if (sf && sf.includes(ql)) return 4;
  if (name.includes(ql)) return 5;
  return 6;
}

export function useFacultySearch(query: string, department: string) {
  const [all, setAll] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAllFaculty().then(list => {
      if (cancelled) return;
      setAll(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { inDept, outside } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { inDept: [], outside: [] };
    const matches = all
      .filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.shortForm || '').toLowerCase().includes(q) ||
        (m.title || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      )
      .sort((a, b) => rankMember(a, q) - rankMember(b, q));
    const dept = resolveDepartment(department);
    return {
      inDept: matches.filter(m => resolveDepartment(m.department) === dept),
      outside: matches.filter(m => resolveDepartment(m.department) !== dept),
    };
  }, [all, query, department]);

  return { loading, inDept, outside };
}
