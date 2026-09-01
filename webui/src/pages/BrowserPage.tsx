import React, { useEffect, useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { getJson, postJson } from "../api";

interface Page {
  id: string;
  title: string;
  url: string;
}

export function BrowserPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [shot, setShot] = useState("");
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [navOpen, setNavOpen] = useState<{ id: string; url: string } | null>(null);

  const load = () =>
    getJson<Page[]>("/api/browser/pages")
      .then(setPages)
      .catch((e) => {
        setPages([]);
      });

  useEffect(() => {
    void load();
  }, []);

  const takeScreenshot = async (id: string) => {
    try {
      toast.info("Capturing CDP viewport screenshot...");
      const result = await postJson<{ data: string }>("/api/browser/pages/" + id + "/screenshot");
      setShot(result.data);
      toast.success("Screenshot received.");
    } catch (e) {
      toast.error("Screenshot failed: " + String(e));
    }
  };

  return (
    <>
      <div className="grid">
        <Card
          title="Active Browser Tabs (CDP)"
          action={
            <button className="primary" onClick={() => setNewPageOpen(true)}>
              ＋ NEW TAB
            </button>
          }
        >
          {pages.length ? (
            pages.map((page) => (
              <article key={page.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ minWidth: 0 }}>
                  <b style={{ color: "var(--amber)", fontSize: "13px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🌐 {page.title || page.id}
                  </b>
                  <p style={{ margin: "2px 0", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {page.url}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "6px", flex: "0 0 auto" }}>
                  <button onClick={() => setNavOpen({ id: page.id, url: page.url })}>NAVIGATE</button>
                  <button className="primary" onClick={() => void takeScreenshot(page.id)}>
                    SCREENSHOT
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              No active browser tabs found. Start a new page above or ensure CDP endpoint is active in Settings.
            </p>
          )}
        </Card>

        <Card title="Live Frame Buffer Preview">
          {shot ? (
            <div style={{ border: "1px solid var(--border-mid)", borderRadius: "4px", overflow: "hidden", background: "#000" }}>
              <img style={{ width: "100%", display: "block" }} src={"data:image/png;base64," + shot} alt="CDP Viewport Snapshot" />
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              SELECT "SCREENSHOT" ON AN ACTIVE TAB TO RENDER FRAMEBUFFER
            </div>
          )}
        </Card>
      </div>

      {newPageOpen && (
        <Modal title="Open New Browser Tab" onClose={() => setNewPageOpen(false)}>
          <SimpleForm
            fields={[{ name: "url", label: "Target Website URL", placeholder: "https://example.com" }]}
            onSubmit={async (val) => {
              try {
                await postJson("/api/browser/pages", { url: val.url || "about:blank" });
                setNewPageOpen(false);
                await load();
                toast.success("Opened new tab.");
              } catch (e) {
                toast.error("Failed to open tab: " + String(e));
              }
            }}
          />
        </Modal>
      )}

      {navOpen && (
        <Modal title="Navigate Browser Tab" onClose={() => setNavOpen(null)}>
          <SimpleForm
            fields={[{ name: "url", label: "Destination URL", placeholder: navOpen.url }]}
            onSubmit={async (val) => {
              try {
                await postJson("/api/browser/pages/" + navOpen.id + "/navigate", { url: val.url });
                setNavOpen(null);
                await load();
                toast.success("Navigated.");
              } catch (e) {
                toast.error("Failed to navigate: " + String(e));
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}