'use client';

import { useEffect, useState } from 'react';

// Maps teacher names / short forms (lowercased) → personal phone numbers from
// the faculty directory, so routine Course Information tables can show the
// teacher's phone number when one is available.
export function useTeacherPhones(): Record<string, string> {
  const [phones, setPhones] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetch('/api/faculty')
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const f of (d.members || []) as any[]) {
          if (!f?.phone) continue;
          if (f.name) map[String(f.name).trim().toLowerCase()] = f.phone;
          if (f.shortForm) map[String(f.shortForm).trim().toLowerCase()] = f.phone;
        }
        setPhones(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return phones;
}