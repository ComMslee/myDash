import { useState } from 'react';

export function UserGroupsAdmin({ userGroups, categories, action, busy }) {
  const [adding, setAdding] = useState(false);
  const [editKey, setEditKey] = useState(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-zinc-500 leading-relaxed">
        사용자 그룹은 권한 프리셋. 기본 그룹(<b>root</b>/<b>guest</b>)은 편집/삭제 불가.
      </div>

      {!userGroups.length ? (
        <div className="text-[12px] text-zinc-500">그룹 없음</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {userGroups.map((g) =>
            editKey === g.key ? (
              <UserGroupEditRow
                key={g.key}
                group={g}
                categories={categories}
                busy={busy}
                onCancel={() => setEditKey(null)}
                onSave={async (patch) => {
                  await action({ action: 'usergroup_update', key: g.key, ...patch });
                  setEditKey(null);
                }}
              />
            ) : (
              <UserGroupRow
                key={g.key}
                g={g}
                busy={busy}
                onEdit={() => setEditKey(g.key)}
                onDelete={() =>
                  confirm(`'${g.label}' 그룹을 삭제할까요?`) &&
                  action({ action: 'usergroup_delete', key: g.key })
                }
              />
            ),
          )}
        </div>
      )}

      {adding ? (
        <UserGroupEditRow
          isNew
          categories={categories}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (patch) => {
            await action({ action: 'usergroup_create', ...patch });
            setAdding(false);
          }}
        />
      ) : (
        <button
          disabled={busy}
          onClick={() => setAdding(true)}
          className="self-start px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 text-[12px] hover:bg-blue-500/25 disabled:opacity-30"
        >
          + 새 그룹
        </button>
      )}
    </div>
  );
}

function UserGroupRow({ g, busy, onEdit, onDelete }) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
            {g.label}
            <span className="text-[10px] text-zinc-500">#{g.key}</span>
            {g.is_default && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">기본</span>
            )}
            {g.is_root && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">root</span>
            )}
          </div>
          {g.desc && <div className="text-[11px] text-zinc-400">{g.desc}</div>}
          <div className="text-[10px] text-zinc-500 mt-1">
            기능: {g.is_root ? '* (전체)' : (g.features.length ? g.features.join(', ') : '없음')}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            disabled={busy || g.is_default}
            onClick={onEdit}
            className="px-2 py-1 rounded bg-white/[0.05] text-zinc-300 text-[11px] hover:bg-white/[0.1] disabled:opacity-30"
            title={g.is_default ? '기본 그룹은 편집 불가' : ''}
          >
            편집
          </button>
          <button
            disabled={busy || g.is_default}
            onClick={onDelete}
            className="px-2 py-1 rounded bg-rose-500/10 text-rose-300/80 text-[11px] hover:bg-rose-500/20 disabled:opacity-30"
            title={g.is_default ? '기본 그룹은 삭제 불가' : ''}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function UserGroupEditRow({ group, categories, isNew, busy, onSave, onCancel }) {
  const [key, setKey] = useState(group?.key || '');
  const [label, setLabel] = useState(group?.label || '');
  const [desc, setDesc] = useState(group?.desc || '');
  const [sort, setSort] = useState(group?.sort_order ?? 100);
  const [features, setFeatures] = useState(group?.features || []);

  const toggleFeature = (k) => {
    setFeatures((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const submit = () => {
    if (!label.trim()) return alert('label 필수');
    if (isNew && !/^[a-z][a-z0-9_]{0,31}$/.test(key.trim())) {
      return alert('key: 영문 소문자/숫자/_ 1~32자 (첫 글자 영문)');
    }
    const patch = {
      label: label.trim(),
      desc: desc.trim(),
      sort_order: +sort,
      features,
    };
    if (isNew) patch.key = key.trim();
    onSave(patch);
  };

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2.5 flex flex-col gap-1.5">
      {isNew && (
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase())}
          placeholder="key (예: editor, family)"
          className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px] font-mono"
          autoFocus
        />
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="label (예: 📝 편집자)"
        className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px]"
        autoFocus={!isNew}
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="설명 (선택)"
        className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px]"
      />
      <div>
        <div className="text-[11px] text-zinc-500 mb-1">포함 기능 그룹</div>
        <div className="flex flex-wrap gap-1.5">
          {categories.length ? categories.map((c) => {
            const has = features.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleFeature(c.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  has
                    ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                    : 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.08]'
                }`}
              >
                {has ? '✓' : '+'} {c.label}
              </button>
            );
          }) : <span className="text-[11px] text-zinc-600">기능 그룹 없음</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-zinc-500">정렬</label>
        <input
          type="number"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px] w-20"
        />
        <div className="flex-1" />
        <button
          disabled={busy}
          onClick={onCancel}
          className="px-2.5 py-1 rounded bg-white/[0.05] text-zinc-300 text-[11px] hover:bg-white/[0.1]"
        >
          취소
        </button>
        <button
          disabled={busy}
          onClick={submit}
          className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-200 text-[11px] hover:bg-emerald-500/30 disabled:opacity-30"
        >
          {isNew ? '만들기' : '저장'}
        </button>
      </div>
    </div>
  );
}
