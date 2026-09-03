import React, { useEffect, useState } from "react";
import { Card, Modal, toast } from "../components";
import { getJson, postJson, deleteJson, webToken } from "../api";
import type { PageProps } from "./shared";
import type { SafeUser, UserRole } from "../types";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "team.title": { en: "TEAM & COLLABORATION", "zh-CN": "多人协同与团队成员" },
  "team.subtitle": {
    en: "Manage team member credentials, assign authorized workspaces, and control administrator access.",
    "zh-CN": "管理团队成员账号与登录密码，授权指定工作区，划分管理员与协同权限。",
  },
  "team.addMember": { en: "＋ REGISTER NEW MEMBER", "zh-CN": "＋ 创建协同账号 / 管理员" },
  "team.totalMembers": { en: "TOTAL MEMBERS", "zh-CN": "成员总数" },
  "team.adminCount": { en: "ADMINISTRATORS", "zh-CN": "管理员" },
  "team.collabCount": { en: "COLLABORATORS", "zh-CN": "协同成员" },
  "team.setPassword": { en: "🔑 设置登录密码", "zh-CN": "🔑 设置登录密码" },
  "team.editWorkspaces": { en: "⚙️ 授权工作区", "zh-CN": "⚙️ 授权工作区" },
  "team.delete": { en: "🗑 删除", "zh-CN": "🗑 删除" },
});

export function TeamPage({ state }: PageProps) {
  const { t } = useI18n();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState<UserRole>("collaborator");
  const [newUserProjects, setNewUserProjects] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Password modal
  const [pwdModalUser, setPwdModalUser] = useState<SafeUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  // Workspace modal
  const [wsModalUser, setWsModalUser] = useState<SafeUser | null>(null);
  const [editProjects, setEditProjects] = useState<string[]>([]);
  const [wsSaving, setWsSaving] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getJson<SafeUser[]>("/api/users");
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message || "获取成员列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      toast.error("请输入用户名");
      return;
    }
    if (!newUserPassword || newUserPassword.length < 4) {
      toast.error("登录密码长度至少需要 4 位字符");
      return;
    }
    if (newUserPassword !== newUserConfirmPassword) {
      toast.error("两次输入的登录密码不一致");
      return;
    }

    setCreating(true);
    try {
      await postJson("/api/users", {
        username: newUsername.trim(),
        password: newUserPassword,
        role: newUserRole,
        allowedProjectIds: newUserRole === "admin" ? ["*"] : newUserProjects,
      });
      toast.success(`成员账号 '${newUsername.trim()}' 创建成功，登录密码已持久化保存！`);
      setCreateModalOpen(false);
      setNewUsername("");
      setNewUserPassword("");
      setNewUserConfirmPassword("");
      setNewUserProjects([]);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message || "创建账号失败");
    } finally {
      setCreating(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdModalUser) return;
    if (!newPassword || newPassword.length < 4) {
      toast.error("登录密码长度至少需要 4 位字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setPwdSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(pwdModalUser.id)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(webToken ? { "x-corvus-token": webToken } : {}),
        },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新登录密码失败");
      toast.success(`已成功为账号 '${pwdModalUser.username}' 设置新的登录密码！`);
      setPwdModalUser(null);
      setNewPassword("");
      setConfirmPassword("");
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message || "更新登录密码失败");
    } finally {
      setPwdSaving(false);
    }
  };

  const handleSaveWorkspaces = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsModalUser) return;
    setWsSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(wsModalUser.id)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(webToken ? { "x-corvus-token": webToken } : {}),
        },
        body: JSON.stringify({ allowedProjectIds: editProjects }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新工作区授权失败");
      toast.success(`已更新账号 '${wsModalUser.username}' 的工作区授权！`);
      setWsModalUser(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message || "更新工作区授权失败");
    } finally {
      setWsSaving(false);
    }
  };

  const handleDeleteUser = async (user: SafeUser) => {
    if (!window.confirm(`确定要永久删除账号 '${user.username}' 吗？`)) return;
    try {
      await deleteJson(`/api/users/${encodeURIComponent(user.id)}`);
      toast.success(`已删除账号 '${user.username}'`);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message || "删除账号失败");
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;
  const collabCount = users.filter((u) => u.role === "collaborator").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Overview Metric Stats */}
      <div className="grid kpi-grid">
        <Card title={t("team.totalMembers")}>
          <div className="metric-large">{users.length}</div>
        </Card>
        <Card title={t("team.adminCount")}>
          <div className="metric-large" style={{ color: "var(--amber-bright)" }}>
            {adminCount}
          </div>
        </Card>
        <Card title={t("team.collabCount")}>
          <div className="metric-large" style={{ color: "var(--vfd-cyan)" }}>
            {collabCount}
          </div>
        </Card>
      </div>

      {/* Main Members Management Card */}
      <Card
        title="👥 团队协同成员与权限分配 (Team Members & Scoped Workspaces)"
        action={
          <button className="primary" onClick={() => setCreateModalOpen(true)}>
            {t("team.addMember")}
          </button>
        }
      >
        <p style={{ margin: "0 0 16px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          在此为团队协同成员创建账号、设置并修改其登录密码，以及授权其可见的工作区。
          协同成员登录后<strong>仅能看到其被授权的工作区与对话</strong>，系统设置、密钥及服务商配置受保护且不可见。
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {users.map((u) => {
            const isAdmin = u.role === "admin";
            const isSelf = u.username === state.currentUser?.username;
            return (
              <article
                key={u.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "#10131a",
                  border: "1px solid var(--border-mid)",
                  borderLeft: isAdmin ? "4px solid var(--amber)" : "4px solid var(--vfd-cyan)",
                  borderRadius: "4px",
                  gap: "16px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "16px" }}>{isAdmin ? "👑" : "🤝"}</span>
                    <b
                      style={{
                        color: isAdmin ? "var(--amber-bright)" : "var(--vfd-cyan)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "15px",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {u.username}
                    </b>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: isAdmin ? "rgba(255, 122, 0, 0.15)" : "rgba(0, 240, 255, 0.15)",
                        color: isAdmin ? "var(--amber)" : "var(--vfd-cyan)",
                        fontFamily: "var(--font-mono)",
                        border: isAdmin ? "1px solid rgba(255,122,0,0.3)" : "1px solid rgba(0,240,255,0.3)",
                      }}
                    >
                      {isAdmin ? "管理员" : "协同成员"}
                    </span>
                    {isSelf && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "1px 5px",
                          background: "#1f2430",
                          color: "var(--text-dim)",
                          borderRadius: "3px",
                        }}
                      >
                        (当前登录)
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>授权工作区：</span>
                    {isAdmin || u.allowedProjectIds.includes("*") ? (
                      <span style={{ color: "var(--amber)", fontWeight: 600 }}>👑 全部工作区 (不受限)</span>
                    ) : u.allowedProjectIds.length === 0 ? (
                      <span style={{ color: "var(--text-dim)" }}>未授权任何工作区 (无访问权限)</span>
                    ) : (
                      u.allowedProjectIds.map((pId) => {
                        const pObj = state.projects.find((p) => p.id === pId);
                        return (
                          <span
                            key={pId}
                            style={{
                              padding: "2px 6px",
                              background: "#181d28",
                              borderRadius: "3px",
                              border: "1px solid var(--border-dark)",
                              color: "var(--text-main)",
                            }}
                          >
                            📁 {pObj ? `${pObj.name} [${pObj.path}]` : pId}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => {
                      setPwdModalUser(u);
                      setNewPassword("");
                      setConfirmPassword("");
                      setShowPassword(false);
                    }}
                    title={`为 ${u.username} 设置新登录密码`}
                  >
                    {t("team.setPassword")}
                  </button>

                  {!isAdmin && (
                    <button
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                      onClick={() => {
                        setWsModalUser(u);
                        setEditProjects(u.allowedProjectIds);
                      }}
                      title={`调整 ${u.username} 授权访问的工作区`}
                    >
                      {t("team.editWorkspaces")}
                    </button>
                  )}

                  {!isSelf && (
                    <button
                      className="danger"
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                      onClick={() => handleDeleteUser(u)}
                    >
                      {t("team.delete")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Card>

      {/* Modal 1: Create New Member */}
      {createModalOpen && (
        <Modal title="创建新账号 (协同成员 / 管理员)" onClose={() => setCreateModalOpen(false)}>
          <form onSubmit={handleCreateUser} style={{ display: "grid", gap: "14px" }}>
            <label>
              <span>账号用户名 (Username)：</span>
              <input
                type="text"
                value={newUsername}
                placeholder="例如 dev_zhang"
                required
                autoFocus
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </label>

            <label>
              <span>设置用户登录密码：</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newUserPassword}
                  placeholder="至少 4 位字符"
                  required
                  style={{ flex: 1 }}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((s) => !s)}
                  style={{ fontSize: "11px", padding: "6px 8px" }}
                >
                  {showNewPassword ? "👁️‍🗨️" : "👁️"}
                </button>
              </div>
            </label>

            <label>
              <span>确认登录密码：</span>
              <input
                type={showNewPassword ? "text" : "password"}
                value={newUserConfirmPassword}
                placeholder="再次输入登录密码"
                required
                onChange={(e) => setNewUserConfirmPassword(e.target.value)}
              />
            </label>

            <label>
              <span>账号角色权限：</span>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              >
                <option value="collaborator">🤝 协同成员 (仅限被授权的工作区与对话，无系统配置权限)</option>
                <option value="admin">👑 管理员 (具备完整系统配置、团队账号管理与全量工作区权限)</option>
              </select>
            </label>

            {newUserRole === "collaborator" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--amber-bright)", fontWeight: 600 }}>
                    勾选授权访问的工作区（项目）：
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      style={{ fontSize: "10px", padding: "2px 6px" }}
                      onClick={() => setNewUserProjects(state.projects.map((p) => p.id))}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: "10px", padding: "2px 6px" }}
                      onClick={() => setNewUserProjects([])}
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    background: "#0c0e14",
                    border: "1px solid var(--border-mid)",
                    borderRadius: "4px",
                    padding: "8px 12px",
                    marginTop: "6px",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  {state.projects.length === 0 ? (
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>暂无已挂载项目</span>
                  ) : (
                    state.projects.map((p) => {
                      const checked = newUserProjects.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUserProjects((prev) => [...prev, p.id]);
                              } else {
                                setNewUserProjects((prev) => prev.filter((id) => id !== p.id));
                              }
                            }}
                          />
                          <span>📁 <b>{p.name}</b> [{p.path}]</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <small style={{ color: "var(--text-dim)", fontSize: "11px", display: "block", marginTop: "4px" }}>
                  协同成员登录后仅可查看所勾选的项目工作区和对话。
                </small>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={() => setCreateModalOpen(false)}>
                取消
              </button>
              <button type="submit" className="primary" disabled={creating}>
                {creating ? "创建中..." : "确认创建账号"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 2: Set/Change User Password */}
      {pwdModalUser && (
        <Modal title={`设置用户登录密码：${pwdModalUser.username}`} onClose={() => setPwdModalUser(null)}>
          <form onSubmit={handleSavePassword} style={{ display: "grid", gap: "14px" }}>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              为用户 <b>{pwdModalUser.username}</b> 设置新的登录密码。更新后该用户将使用此新密码登录系统。
            </p>

            <label>
              <span>新登录密码：</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  placeholder="至少 4 位字符"
                  required
                  autoFocus
                  style={{ flex: 1 }}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  style={{ fontSize: "11px", padding: "6px 8px" }}
                >
                  {showPassword ? "👁️‍🗨️" : "👁️"}
                </button>
              </div>
            </label>

            <label>
              <span>确认新登录密码：</span>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                placeholder="再次输入新密码以确认"
                required
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={() => setPwdModalUser(null)}>
                取消
              </button>
              <button type="submit" className="primary" disabled={pwdSaving}>
                {pwdSaving ? "正在保存..." : "确认更新登录密码"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 3: Edit Authorized Workspaces */}
      {wsModalUser && (
        <Modal title={`授权工作区：${wsModalUser.username}`} onClose={() => setWsModalUser(null)}>
          <form onSubmit={handleSaveWorkspaces} style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--amber-bright)", fontWeight: 600 }}>
                调整该成员授权访问的工作区：
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  style={{ fontSize: "10px", padding: "2px 6px" }}
                  onClick={() => setEditProjects(state.projects.map((p) => p.id))}
                >
                  全选
                </button>
                <button
                  type="button"
                  style={{ fontSize: "10px", padding: "2px 6px" }}
                  onClick={() => setEditProjects([])}
                >
                  清空
                </button>
              </div>
            </div>

            <div
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                background: "#0c0e14",
                border: "1px solid var(--border-mid)",
                borderRadius: "4px",
                padding: "8px 12px",
                display: "grid",
                gap: "6px",
              }}
            >
              {state.projects.map((p) => {
                const checked = editProjects.includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditProjects((prev) => [...prev, p.id]);
                        } else {
                          setEditProjects((prev) => prev.filter((id) => id !== p.id));
                        }
                      }}
                    />
                    <span>📁 <b>{p.name}</b> [{p.path}]</span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={() => setWsModalUser(null)}>
                取消
              </button>
              <button type="submit" className="primary" disabled={wsSaving}>
                {wsSaving ? "保存中..." : "保存工作区授权"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
