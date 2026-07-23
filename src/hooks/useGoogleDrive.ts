import { useState, useEffect, useCallback } from "react";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

export interface CatalogSegment {
  id: string;
  name: string;
  distanceMeters: number;
  elevationGainMeters: number;
  avgGradePercent: number;
  startCoords: [number, number];
  endCoords: [number, number];
}

export interface Catalog {
  segments: CatalogSegment[];
}

export function useGoogleDrive() {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem("gdrive_access_token"));
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem("gdrive_client_id") || "");
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem("gdrive_user_email"));
  const [loading, setLoading] = useState<boolean>(false);
  const [catalog, setCatalog] = useState<Catalog>({ segments: [] });

  // Save configurations to localStorage
  useEffect(() => {
    if (accessToken) {
      localStorage.setItem("gdrive_access_token", accessToken);
    } else {
      localStorage.removeItem("gdrive_access_token");
    }
  }, [accessToken]);

  useEffect(() => {
    localStorage.setItem("gdrive_client_id", clientId);
  }, [clientId]);

  // Load Google Identity Services script
  useEffect(() => {
    if (document.getElementById("google-gis-script")) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.id = "google-gis-script";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  const login = useCallback(() => {
    if (!clientId) {
      alert("Please configure Google Client ID first in settings.");
      return;
    }

    const google = (window as any).google;
    if (!google) {
      alert("Google Auth library not loaded yet. Try again in a second.");
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          setAccessToken(tokenResponse.access_token);
          fetchUserInfo(tokenResponse.access_token);
        }
      },
    });

    tokenClient.requestAccessToken();
  }, [clientId]);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUserEmail(null);
    localStorage.removeItem("gdrive_user_email");
    setCatalog({ segments: [] });
  }, []);

  const fetchUserInfo = async (token: string) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          setUserEmail(data.email);
          localStorage.setItem("gdrive_user_email", data.email);
        }
      }
    } catch (e) {
      // Ignored
    }
  };

  // Helper: Find or create Leaderboard_Segments folder
  const findOrCreateFolder = async (token: string): Promise<string | null> => {
    try {
      // Search for folder
      const query = encodeURIComponent("name = 'Leaderboard_Segments' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) return null;
      const data = await res.json();
      
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }

      // Create folder if not found
      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Leaderboard_Segments",
          mimeType: "application/vnd.google-apps.folder",
        }),
      });

      if (!createRes.ok) return null;
      const folderData = await createRes.json();
      return folderData.id;
    } catch (e) {
      return null;
    }
  };

  // Load catalog.json
  const loadCatalog = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not access/create Leaderboard_Segments folder");

      // Search for catalog.json inside folder
      const query = encodeURIComponent(`name = 'catalog.json' and '${folderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error("Error searching for catalog.json");
      const listData = await res.json();

      if (listData.files && listData.files.length > 0) {
        const fileId = listData.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (fileRes.ok) {
          const cat = await fileRes.json();
          setCatalog(cat);
        }
      } else {
        setCatalog({ segments: [] });
      }
    } catch (e) {
      // Ignored or reset
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Upload new segment and update catalog
  const saveSegment = async (
    name: string,
    gpxContent: string,
    meta: Omit<CatalogSegment, "id" | "name">
  ): Promise<boolean> => {
    if (!accessToken) {
      alert("Please login first.");
      return false;
    }
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not find/create app folder");

      const fileName = `${name.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;

      // Upload GPX file
      const metadata = {
        name: fileName,
        parents: [folderId],
      };

      const fileContentBlob = new Blob([gpxContent], { type: "application/gpx+xml" });
      const formData = new FormData();
      formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      formData.append("file", fileContentBlob);

      // Search if file already exists to overwrite it
      const query = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const checkData = await checkRes.json();

      let uploadRes;
      if (checkData.files && checkData.files.length > 0) {
        // Update existing file
        const existingFileId = checkData.files[0].id;
        uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });
      } else {
        // Create new file
        uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });
      }

      if (!uploadRes.ok) throw new Error("GPX upload failed");

      // Update Catalog
      const newSegment: CatalogSegment = {
        id: fileName,
        name,
        ...meta,
      };

      let updatedSegments = catalog.segments.filter((s) => s.id !== fileName);
      updatedSegments.push(newSegment);
      const newCatalog: Catalog = { segments: updatedSegments };

      // Save new catalog.json
      const catMetadata = {
        name: "catalog.json",
        parents: [folderId],
      };
      
      const catFormData = new FormData();
      catFormData.append("metadata", new Blob([JSON.stringify(catMetadata)], { type: "application/json" }));
      catFormData.append("file", new Blob([JSON.stringify(newCatalog, null, 2)], { type: "application/json" }));

      // Find catalog.json file ID
      const catQuery = encodeURIComponent(`name = 'catalog.json' and '${folderId}' in parents and trashed = false`);
      const catCheck = await fetch(`https://www.googleapis.com/drive/v3/files?q=${catQuery}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const catCheckData = await catCheck.json();

      let catUploadRes;
      if (catCheckData.files && catCheckData.files.length > 0) {
        const catFileId = catCheckData.files[0].id;
        catUploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${catFileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catFormData,
        });
      } else {
        catUploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catFormData,
        });
      }

      if (!catUploadRes.ok) throw new Error("Catalog update failed");

      setCatalog(newCatalog);
      return true;
    } catch (e: any) {
      alert("Error saving: " + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Load catalog on login/startup
  useEffect(() => {
    if (accessToken) {
      loadCatalog();
    }
  }, [accessToken, loadCatalog]);

  return {
    accessToken,
    clientId,
    userEmail,
    loading,
    catalog,
    setClientId,
    login,
    logout,
    saveSegment,
    refreshCatalog: loadCatalog,
  };
}
