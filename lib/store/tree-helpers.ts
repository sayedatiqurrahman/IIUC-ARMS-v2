import { config } from '../config';
import { FACULTIES, getFacultyIdForDepartment, getAllFacultyIds, getDepartmentIdByFolder, isShariahDepartmentId } from '../departments';
import { extractYear, getMimeFromExt } from '../utils';
import { detectCategory, parseCourseFilePath } from './helpers';
import type { AppState, Category, Semester } from './types';

type GetState = () => AppState;

export function createTreeHelpers(get: GetState) {
  return {
    getUploadTree: (): any[] => {
      const { tree } = get();
      const facultyIds = getAllFacultyIds();
      return tree
        .filter((item) => item.path.startsWith(config.uploadPath + '/'))
        .map((item) => {
          const rel = item.path.substring(config.uploadPath.length + 1);
          const parts = rel.split('/');
          const first = parts[0];

          if (first === config.relatedKitabsParent && parts[1] === config.relatedKitabsFolder) {
            const inner = parts.slice(2).join('/');
            return { ...item, path: config.relatedKitabsFolder + '/' + inner, department: 'shariah', githubPath: rel };
          }

          if (first === config.relatedKitabsFolder) {
            return { ...item, path: rel, department: 'shariah', githubPath: rel };
          }

          if (facultyIds.includes(first) && parts[1] === config.relatedSourcesFolder) {
            const inner = parts.slice(2).join('/');
            return { ...item, path: config.relatedSourcesFolder + '/' + inner, department: first, githubPath: rel };
          }

          if (config.isDepartmentId(first)) {
            const inner = parts.slice(1).join('/');
            return { ...item, path: inner || rel, department: getDepartmentIdByFolder(first), githubPath: rel };
          }

          return { ...item, path: rel, department: 'qsis', githubPath: rel };
        });
    },

    getUploadDepartments: () => {
      const uploadTree = get().getUploadTree();
      const depts = new Map<string, { files: number; semesters: Set<string> }>();

      for (const faculty of FACULTIES) {
        for (const dept of faculty.departments) {
          depts.set(dept.id, { files: 0, semesters: new Set() });
        }
      }

      uploadTree.forEach((item: any) => {
        if (!item.department) return;
        const dept = item.department;
        if (!depts.has(dept)) return;
        const d = depts.get(dept)!;

        if (item.type === 'blob') {
          const parts = item.path.split('/');
          const sem = parts[0];
          const courseFolder = parts[1] || '';
          const isCourseFolder = config.semesters.some(s => s.id === sem) && /^[A-Z]{2,5}-\d{3,5}\s*-\s*.+$/i.test(courseFolder);
          if (isCourseFolder) {
            const fileName = parts[parts.length - 1];
            if (fileName !== '.gitkeep') d.files++;
          }
        }

        const parts = item.path.split('/');
        const sem = parts[0];
        if (sem && config.semesters.some(s => s.id === sem)) d.semesters.add(sem);
      });

      return Array.from(depts.entries()).map(([id, data]) => {
        const found = (() => {
          for (const f of FACULTIES) {
            const dept = f.departments.find(d => d.id === id);
            if (dept) return { faculty: f, department: dept };
          }
          return null;
        })();
        return {
          id,
          name: found?.department.name || id,
          shortName: found?.department.shortName || id.toUpperCase(),
          icon: found?.department.icon || 'fa-building',
          facultyName: found?.faculty.name || '',
          facultyShortName: found?.faculty.shortName || '',
          facultyIcon: found?.faculty.icon || 'fa-graduation-cap',
          files: data.files,
          semesters: data.semesters.size,
        };
      }).sort((a, b) => {
        const aIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === a.id));
        const bIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === b.id));
        if (aIdx !== bIdx) return aIdx - bIdx;
        const aFac = FACULTIES[aIdx];
        const bFac = FACULTIES[bIdx];
        const aDeptIdx = aFac?.departments.findIndex(d => d.id === a.id) ?? 0;
        const bDeptIdx = bFac?.departments.findIndex(d => d.id === b.id) ?? 0;
        return aDeptIdx - bDeptIdx;
      });
    },

    getSemesters: (departmentId?: string | null): Semester[] => {
      const uploadTree = get().getUploadTree();
      const sems = new Map<string, { files: number; courses: Set<string> }>();

      config.semesters.forEach((s) => {
        sems.set(s.id, { files: 0, courses: new Set() });
      });

      const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

      uploadTree.forEach((item: any) => {
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }

        const parts = item.path.split('/');
        const sem = parts[0];
        if (!sem) return;

        if (sem === config.relatedKitabsFolder) {
          if (!sems.has(config.relatedKitabsFolder)) sems.set(config.relatedKitabsFolder, { files: 0, courses: new Set() });
          const s = sems.get(config.relatedKitabsFolder)!;
          if (item.type === 'blob') {
            const fileName = parts[parts.length - 1];
            if (fileName !== '.gitkeep') s.files++;
          }
          if (parts.length >= 3 && parts[1]) s.courses.add(parts[1]);
          return;
        }

        if (sem === config.relatedSourcesFolder) {
          if (!sems.has(config.relatedSourcesFolder)) sems.set(config.relatedSourcesFolder, { files: 0, courses: new Set() });
          const s = sems.get(config.relatedSourcesFolder)!;
          if (item.type === 'blob') {
            const fileName = parts[parts.length - 1];
            if (fileName !== '.gitkeep') s.files++;
          }
          if (parts.length >= 3 && parts[1]) s.courses.add(parts[1]);
          return;
        }

        if (!config.semesters.some(ss => ss.id === sem) && sem !== config.relatedKitabsFolder && sem !== config.relatedSourcesFolder) return;

        if (!sems.has(sem)) sems.set(sem, { files: 0, courses: new Set() });
        const s = sems.get(sem)!;

        const second = parts[1] || '';
        const dashMatch = second.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);
        if (dashMatch) {
          s.courses.add(dashMatch[1].toUpperCase());
          if (item.type === 'blob') {
            const fileName = parts[parts.length - 1];
            if (fileName !== '.gitkeep') s.files++;
          }
        }
      });

      const isShariahDept = !departmentId || isShariahDepartmentId(departmentId);

      return Array.from(sems.entries())
        .map(([id, data]) => {
          const cfg = config.semesters.find(s => s.id === id);
          const isRelated = id === config.relatedKitabsFolder;
          const isSources = id === config.relatedSourcesFolder;
          let label: string;
          if (isRelated) label = 'Related Kitabs';
          else if (isSources) label = 'Related Sources';
          else label = cfg?.label || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return { id, label, files: data.files, courses: data.courses.size, isRelated, isSources };
        })
        .filter((s) => {
          if (departmentId) {
            if (s.isRelated && !isShariahDept) return false;
            if (s.isSources && isShariahDept) return false;
            return true;
          }
          if (s.files === 0) return false;
          if (s.isRelated && !isShariahDept) return false;
          if (s.isSources && isShariahDept) return false;
          return true;
        })
        .sort((a, b) => {
          if (a.isRelated) return 1;
          if (b.isRelated) return -1;
          if (a.isSources) return 1;
          if (b.isSources) return -1;
          return a.id.localeCompare(b.id);
        });
    },

    getCategories: (semId: string, departmentId?: string | null): Category[] => {
      const uploadTree = get().getUploadTree();
      const isRelated = semId === config.relatedKitabsFolder;
      const isSources = semId === config.relatedSourcesFolder;
      const prefix = semId + '/';
      const folderCounts: Record<string, number> = {};
      const knownFolders = new Set<string>();
      const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

      let hasCourseFolders = false;

      uploadTree.forEach((item: any) => {
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }

        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parts = rel.split('/');
        if (parts.length < 2) return;

        const firstFolder = parts[1];
        const dashMatch = firstFolder.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);

        if (dashMatch) {
          hasCourseFolders = true;
          const third = parts[2];
          const isMidFinal = third === 'Mid' || third === 'Final';
          const catFolder = isMidFinal ? parts[3] : third;
          if (catFolder && catFolder !== '.gitkeep') {
            knownFolders.add(catFolder);
            if (item.type === 'blob') {
              const fileName = item.path.split('/').pop();
              if (fileName !== '.gitkeep') {
                folderCounts[catFolder] = (folderCounts[catFolder] || 0) + 1;
              }
            }
          }
        } else {
          const catFolder = firstFolder;
          if (catFolder) {
            knownFolders.add(catFolder);
            if (item.type === 'blob') {
              const fileName = item.path.split('/').pop();
              if (fileName !== '.gitkeep') {
                folderCounts[catFolder] = (folderCounts[catFolder] || 0) + 1;
              }
            }
          }
        }
      });

      const catEntries: Category[] = [];
      knownFolders.forEach((folderName) => {
        const count = folderCounts[folderName] || 0;
        const cat = detectCategory(folderName);
        const existing = catEntries.find((e) => e.cat === cat);
        if (existing) {
          existing.count += count;
          if (!existing.folders.includes(folderName)) existing.folders.push(folderName);
        } else {
          catEntries.push({ cat, count, folders: [folderName] });
        }
      });

      if (isRelated) {
        return catEntries.map(entry => {
          const catCfg = config.relatedKitabsCategories[entry.cat];
          return {
            ...entry,
            label: catCfg?.label || entry.cat,
            icon: catCfg?.icon || 'folder',
            color: catCfg?.color || '#94a3b8',
          };
        });
      }

      if (isSources) {
        return catEntries.map(entry => ({
          ...entry,
          label: 'Related Sources',
          icon: 'book',
          color: '#0ea5e9',
        }));
      }

      return catEntries;
    },

    getCourses: (semId: string, catKey: string, departmentId?: string | null): [string, any[]][] => {
      const uploadTree = get().getUploadTree();
      const categories = get().getCategories(semId, departmentId);
      const catEntry = categories.find((c) => c.cat === catKey);
      if (!catEntry || catEntry.folders.length === 0) return [];

      const catFolders = new Set(catEntry.folders);
      const prefix = semId + '/';
      const courses = new Map<string, any[]>();
      const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        if (fileName === '.gitkeep') return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parts = rel.split('/');
        if (parts.length < 3) return;

        const firstFolder = parts[1];
        const dashMatch = firstFolder.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);
        if (!dashMatch) return;

        const courseName = dashMatch[1].toUpperCase();
        const third = parts[2];
        const isMidFinal = third === 'Mid' || third === 'Final';
        const catFolder = isMidFinal ? parts[3] : third;

        if (!catFolders.has(catFolder)) return;
        if (!courseName) return;

        if (!courses.has(courseName)) courses.set(courseName, []);
        courses.get(courseName)!.push(item);
      });

      return Array.from(courses.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    },

    getSemesterCourses: (semId: string, departmentId?: string | null) => {
      const uploadTree = get().getUploadTree();
      const prefix = semId + '/';
      const courseMap = new Map<string, { title: string; categories: Map<string, number>; totalFiles: number; midCount: number; finalCount: number; rootCount: number; readmes: Set<string>; mdFiles: Set<string> }>();
      const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

      uploadTree.forEach((item: any) => {
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parts = rel.split('/');

        const first = parts[0] || '';
        const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);
        if (dashMatch) {
          const code = dashMatch[1].toUpperCase();
          const title = dashMatch[2].trim();
          if (!courseMap.has(code)) {
            courseMap.set(code, { title, categories: new Map(), totalFiles: 0, midCount: 0, finalCount: 0, rootCount: 0, readmes: new Set(), mdFiles: new Set() });
          } else {
            const c = courseMap.get(code)!;
            if (title !== code && c.title === code) c.title = title;
          }
        }
      });

      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        if (fileName === '.gitkeep') return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);

        const parsed = parseCourseFilePath(rel);
        if (!parsed) return;

        const { code, title, category, midFinal } = parsed;

        if (!courseMap.has(code)) {
          courseMap.set(code, { title: code, categories: new Map(), totalFiles: 0, midCount: 0, finalCount: 0, rootCount: 0, readmes: new Set(), mdFiles: new Set() });
        }
        const c = courseMap.get(code)!;
        if (title !== code && c.title === code) c.title = title;
        c.totalFiles++;
        if (midFinal === 'Mid') c.midCount++;
        else if (midFinal === 'Final') c.finalCount++;
        else c.rootCount++;

        c.categories.set(category, (c.categories.get(category) || 0) + 1);
      });

      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        const lowerName = fileName?.toLowerCase() || '';
        if (!lowerName.endsWith('.md')) return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parts = rel.split('/');
        const first = parts[0] || '';
        const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);
        if (!dashMatch) return;
        const code = dashMatch[1].toUpperCase();
        const c = courseMap.get(code);
        if (c) {
          const folderPath = parts.slice(1).join('/').replace(/\/[^/]+$/i, '').toLowerCase();
          c.readmes.add(folderPath);
          c.mdFiles.add(folderPath);
        }
      });

      return Array.from(courseMap.entries())
        .map(([code, data]) => ({
          code,
          title: data.title,
          categories: Array.from(data.categories.entries()).map(([key, count]) => ({
            key,
            label: config.categories[key as keyof typeof config.categories]?.label || key,
            icon: config.categories[key as keyof typeof config.categories]?.icon || 'folder',
            count,
            hasLinks: data.readmes.has(key),
          })),
          totalFiles: data.totalFiles,
          hasMidFinal: data.midCount > 0 || data.finalCount > 0,
          hasSharedLinks: data.readmes.size > 0,
          hasMd: data.mdFiles.size > 0,
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    },

    getCourseCategories: (semId: string, courseCode: string, departmentId?: string | null, midFinal?: string | null) => {
      const uploadTree = get().getUploadTree();
      const prefix = semId + '/';
      const code = courseCode.toUpperCase();
      const catMap = new Map<string, { files: any[] }>();
      const folderSet = new Set<string>();
      const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

      uploadTree.forEach((item: any) => {
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parts = rel.split('/');
        const first = parts[0] || '';
        const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);
        if (!dashMatch || dashMatch[1].toUpperCase() !== code) return;

        let mf: string | null = null;
        let catFolder: string | null = null;

        if (parts.length >= 2) {
          const mfCheck = parts[1];
          if (mfCheck === 'Mid' || mfCheck === 'Final') {
            mf = mfCheck;
            catFolder = parts[2] || null;
          } else {
            catFolder = mfCheck;
          }
        }

        if (catFolder && catFolder !== '.gitkeep') {
          const catKey = detectCategory(catFolder);
          const folderKey = `${mf || ''}/${catKey}`;
          folderSet.add(folderKey);
        }
      });

      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        if (fileName === '.gitkeep') return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);

        const parsed = parseCourseFilePath(rel);
        if (!parsed || parsed.code !== code) return;

        if (midFinal) {
          if (parsed.midFinal !== midFinal) return;
          if (!parsed.midFinal) return;
        } else {
          if (parsed.midFinal) return;
        }

        if (!catMap.has(parsed.category)) catMap.set(parsed.category, { files: [] });
        catMap.get(parsed.category)!.files.push(item);
      });

      const courseReadmes = new Set<string>();
      const courseMdFiles = new Set<string>();
      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        const lowerName = fileName?.toLowerCase() || '';
        if (!lowerName.endsWith('.md')) return;
        const rel = item.path.substring(prefix.length);
        if (!rel.toLowerCase().startsWith(code.toLowerCase() + ' - ')) return;
        const afterCourse = rel.substring(rel.indexOf('/') + 1).replace(/\/[^/]+$/i, '').toLowerCase();
        courseMdFiles.add(afterCourse);
        if (lowerName === 'readme.md') {
          courseReadmes.add(afterCourse);
        }
      });

      if (!midFinal) {
        let midCount = 0;
        let finalCount = 0;
        let midHasLinks = false;
        let finalHasLinks = false;
        uploadTree.forEach((item: any) => {
          if (item.type !== 'blob') return;
          const fileName = item.path.split('/').pop();
          if (fileName === '.gitkeep') return;
          if (departmentId) {
            const matchesDept = item.department === departmentId;
            const matchesFaculty = facultyId && item.department === facultyId;
            if (!matchesDept && !matchesFaculty) return;
          }
          if (!item.path.startsWith(prefix)) return;
          const rel = item.path.substring(prefix.length);
          const parsed = parseCourseFilePath(rel);
          if (!parsed || parsed.code !== code) return;
          if (parsed.midFinal === 'Mid') midCount++;
          else if (parsed.midFinal === 'Final') finalCount++;
        });

        midHasLinks = Array.from(courseReadmes).some(k => k.startsWith('mid'));
        finalHasLinks = Array.from(courseReadmes).some(k => k.startsWith('final'));
        const midHasMd = Array.from(courseMdFiles).some(k => k.startsWith('mid'));
        const finalHasMd = Array.from(courseMdFiles).some(k => k.startsWith('final'));

        const hasMidFolder = folderSet.has('Mid/notes') || folderSet.has('Mid/questions') || folderSet.has('Mid/sheet') || folderSet.has('Mid/syllabus') || folderSet.has('Mid/other');
        const hasFinalFolder = folderSet.has('Final/notes') || folderSet.has('Final/questions') || folderSet.has('Final/sheet') || folderSet.has('Final/syllabus') || folderSet.has('Final/other');

        const virtualCats: { key: string; label: string; icon: string; count: number; files: any[]; hasLinks: boolean; hasMd: boolean }[] = [];
        if (midCount > 0 || hasMidFolder) virtualCats.push({ key: '_mid', label: 'Mid', icon: 'fa-pen-fancy', count: midCount, files: [], hasLinks: midHasLinks, hasMd: midHasMd });
        if (finalCount > 0 || hasFinalFolder) virtualCats.push({ key: '_final', label: 'Final', icon: 'fa-graduation-cap', count: finalCount, files: [], hasLinks: finalHasLinks, hasMd: finalHasMd });

        const rootCatKeys = new Set<string>(Array.from(catMap.keys()));
        Array.from(folderSet).forEach(fk => {
          if (fk.startsWith('Mid/') || fk.startsWith('Final/')) return;
          rootCatKeys.add(fk.replace(/^\//, ''));
        });

        const rootCats = Array.from(rootCatKeys).map(key => ({
          key,
          label: config.categories[key as keyof typeof config.categories]?.label || key,
          icon: config.categories[key as keyof typeof config.categories]?.icon || 'folder',
          count: catMap.get(key)?.files.length || 0,
          files: (catMap.get(key)?.files || []).sort((a: any, b: any) => {
            const ya = parseInt(extractYear(a.path) || '0');
            const yb = parseInt(extractYear(b.path) || '0');
            if (yb !== ya) return yb - ya;
            const aSpring = /spring/i.test(a.path) ? 1 : 0;
            const bSpring = /spring/i.test(b.path) ? 1 : 0;
            return bSpring - aSpring;
          }),
          hasLinks: Array.from(courseReadmes).some(k => k === key.toLowerCase() || k.startsWith(key.toLowerCase() + '/')),
          hasMd: Array.from(courseMdFiles).some(k => k === key.toLowerCase() || k.startsWith(key.toLowerCase() + '/')),
        }));
        return [...virtualCats, ...rootCats];
      }

      const resultCats = Array.from(catMap.entries()).map(([key, data]) => ({
        key,
        label: config.categories[key as keyof typeof config.categories]?.label || key,
        icon: config.categories[key as keyof typeof config.categories]?.icon || 'folder',
        count: data.files.length,
        files: data.files.sort((a: any, b: any) => {
          const ya = parseInt(extractYear(a.path) || '0');
          const yb = parseInt(extractYear(b.path) || '0');
          if (yb !== ya) return yb - ya;
          const aSpring = /spring/i.test(a.path) ? 1 : 0;
          const bSpring = /spring/i.test(b.path) ? 1 : 0;
          return bSpring - aSpring;
        }),
        hasLinks: courseReadmes.has((midFinal + '/' + key).toLowerCase()),
        hasMd: courseMdFiles.has((midFinal + '/' + key).toLowerCase()),
      }));

      const resultKeys = new Set(resultCats.map(c => c.key));
      Array.from(folderSet).forEach(fk => {
        if (!fk.startsWith(midFinal + '/')) return;
        const catKey = fk.split('/')[1];
        if (catKey && !resultKeys.has(catKey)) {
          resultCats.push({
            key: catKey,
            label: config.categories[catKey as keyof typeof config.categories]?.label || catKey,
            icon: config.categories[catKey as keyof typeof config.categories]?.icon || 'folder',
            count: 0,
            files: [],
            hasLinks: courseReadmes.has((midFinal + '/' + catKey).toLowerCase()),
            hasMd: courseMdFiles.has((midFinal + '/' + catKey).toLowerCase()),
          });
        }
      });

      return resultCats;
    },

    getCourseMidFinal: (semId: string, courseCode: string, departmentId?: string | null) => {
      const uploadTree = get().getUploadTree();
      const prefix = semId + '/';
      const code = courseCode.toUpperCase();
      const result = { mid: 0, final: 0, root: 0 };
      const facultyId = departmentId ? getFacultyIdForDepartment(departmentId) : null;

      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = item.path.split('/').pop();
        if (fileName === '.gitkeep') return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);

        const parsed = parseCourseFilePath(rel);
        if (!parsed || parsed.code !== code) return;

        if (parsed.midFinal === 'Mid') result.mid++;
        else if (parsed.midFinal === 'Final') result.final++;
        else result.root++;
      });

      uploadTree.forEach((item: any) => {
        if (item.type === 'blob') return;
        if (departmentId) {
          const matchesDept = item.department === departmentId;
          const matchesFaculty = facultyId && item.department === facultyId;
          if (!matchesDept && !matchesFaculty) return;
        }
        if (!item.path.startsWith(prefix)) return;
        const rel = item.path.substring(prefix.length);
        const parts = rel.split('/');
        const first = parts[0] || '';
        const dashMatch = first.match(/^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i);
        if (!dashMatch || dashMatch[1].toUpperCase() !== code) return;
      });

      return result;
    },

    getSearchResults: (query: string, typeFilter: string, yearFilter: string, semFilter: string, departmentId?: string | null) => {
      const uploadTree = get().getUploadTree();
      const q = query.toLowerCase().trim();
      if (!q && !typeFilter && !yearFilter && !semFilter) return { files: [], folders: [] };

      const matchedFiles: any[] = [];
      const matchedFolders = new Map<string, { id: string; label: string; type: string; path: string; count: number }>();

      const COURSE_RE = /^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)$/i;

      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        if (departmentId && item.department !== departmentId && item.department !== null) return;
        const parts = item.path.split('/');
        const sem = parts[0];
        const fileName = parts[parts.length - 1] || '';
        if (fileName === '.gitkeep') return;
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        let catFolder = '';
        let courseName = '';
        const second = parts[1] || '';
        const courseMatch = second.match(COURSE_RE);
        if (courseMatch) {
          courseName = second;
          catFolder = parts[2] || '';
        } else {
          catFolder = second;
          courseName = parts[2] || '';
        }

        if (semFilter && sem !== semFilter) return;
        if (typeFilter && getMimeFromExt(ext) !== typeFilter) return;
        if (yearFilter && extractYear(fileName) !== yearFilter) return;

        if (q) {
          const semLabel = config.semesters.find(s => s.id === sem)?.label || sem.replace(/-/g, ' ');
          const catCfg = config.categories[catFolder as keyof typeof config.categories];
          const catLabel = catCfg?.label || catFolder;
          const matchFileName = fileName.toLowerCase().includes(q);
          const matchCourse = courseName.toLowerCase().includes(q);
          const matchCat = catLabel.toLowerCase().includes(q);
          const matchSem = semLabel.toLowerCase().includes(q);
          const matchCatFolder = catFolder.toLowerCase().includes(q);
          const matchPath = item.path.toLowerCase().includes(q);
          if (!matchFileName && !matchCourse && !matchCat && !matchSem && !matchCatFolder && !matchPath) return;
        }

        matchedFiles.push({ ...item, sem, catFolder, courseName, fileName });

        const semKey = `sem:${sem}`;
        if (!matchedFolders.has(semKey)) {
          const semCfg = config.semesters.find(s => s.id === sem);
          matchedFolders.set(semKey, { id: sem, label: semCfg?.label || sem.replace(/-/g, ' '), type: 'semester', path: sem, count: 0 });
        }
        matchedFolders.get(semKey)!.count++;

        if (catFolder) {
          const catKey = `cat:${sem}/${catFolder}`;
          if (!matchedFolders.has(catKey)) {
            const catCfg = config.categories[catFolder as keyof typeof config.categories];
            matchedFolders.set(catKey, { id: catFolder, label: catCfg?.label || catFolder, type: 'category', path: `${sem}/${catFolder}`, count: 0 });
          }
          matchedFolders.get(catKey)!.count++;
        }

        if (courseName) {
          const courseKey = `course:${sem}/${catFolder}/${courseName}`;
          if (!matchedFolders.has(courseKey)) {
            matchedFolders.set(courseKey, { id: courseName, label: courseName, type: 'course', path: `${sem}/${catFolder}/${courseName}`, count: 0 });
          }
          matchedFolders.get(courseKey)!.count++;
        }
      });

      return { files: matchedFiles, folders: Array.from(matchedFolders.values()) };
    },

    getAvailableYears: (): string[] => {
      const uploadTree = get().getUploadTree();
      const years = new Set<string>();
      uploadTree.forEach((item: any) => {
        if (item.type !== 'blob') return;
        const fileName = (item.path.split('/').pop() || '').toLowerCase();
        if (fileName === '.gitkeep') return;
        const m = item.path.match(/(20\d{2})/);
        if (m) years.add(m[1]);
      });
      return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    },
  };
}
