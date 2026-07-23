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

export interface CloudAttempt {
  id: string;
  riderName: string;
  date: string;
  durationMs: number;
  avgSpeed: number;
}

export interface CloudRankings {
  [segmentId: string]: CloudAttempt[];
}

export function useGoogleDrive() {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem("gdrive_access_token"));
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem("gdrive_client_id") || "");
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem("gdrive_user_email"));
  const [loading, setLoading] = useState<boolean>(false);
  const [catalog, setCatalog] = useState<Catalog>({ segments: [] });
  const [rankings, setRankings] = useState<CloudRankings>({});

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
    setRankings({});
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

  // Helper: check response and handle expired session (401)
  const checkResponse = useCallback((res: Response, contextMsg: string) => {
    if (res.status === 401) {
      setAccessToken(null);
      setUserEmail(null);
      localStorage.removeItem("gdrive_access_token");
      localStorage.removeItem("gdrive_user_email");
      throw new Error("Session expired. Please sign in with Google again.");
    }
    if (!res.ok) {
      throw new Error(`${contextMsg} (HTTP ${res.status})`);
    }
    return res;
  }, []);

  // Helper: Find or create Leaderboard_Segments folder
  const findOrCreateFolder = async (token: string): Promise<string | null> => {
    try {
      // Search for folder
      const query = encodeURIComponent("name = 'Leaderboard_Segments' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      checkResponse(res, "Failed to search Leaderboard_Segments folder");
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

      checkResponse(createRes, "Failed to create Leaderboard_Segments folder");
      const folderData = await createRes.json();
      return folderData.id;
    } catch (e: any) {
      if (e.message?.includes("Session expired")) {
        throw e;
      }
      return null;
    }
  };

  // Load catalog.json and rankings.json
  const loadCatalog = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not access/create Leaderboard_Segments folder");

      // 1. Search and load catalog.json
      const query = encodeURIComponent(`name = 'catalog.json' and '${folderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      checkResponse(res, "Failed to load catalog files list");
      const listData = await res.json();
      if (listData.files && listData.files.length > 0) {
        const fileId = listData.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        checkResponse(fileRes, "Failed to download catalog.json");
        const cat = await fileRes.json();
        setCatalog(cat);
      } else {
        setCatalog({ segments: [] });
      }

      // 2. Search and load rankings.json
      const rankQuery = encodeURIComponent(`name = 'rankings.json' and '${folderId}' in parents and trashed = false`);
      const rankRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${rankQuery}&spaces=drive`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      checkResponse(rankRes, "Failed to load rankings files list");
      const rankListData = await rankRes.json();
      if (rankListData.files && rankListData.files.length > 0) {
        const fileId = rankListData.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        checkResponse(fileRes, "Failed to download rankings.json");
        const ranks = await fileRes.json();
        setRankings(ranks);
      } else {
        setRankings({});
      }
    } catch (e: any) {
      if (e.message?.includes("Session expired")) {
        alert(e.message);
      }
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
      if (!folderId) throw new Error("Could not find/create Leaderboard_Segments folder");

      const fileName = `${name.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      const fileContentBlob = new Blob([gpxContent], { type: "application/gpx+xml" });

      // Search if file already exists to overwrite it
      const query = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      checkResponse(checkRes, "Failed to check existing GPX file");
      const checkData = await checkRes.json();

      let uploadRes;
      if (checkData.files && checkData.files.length > 0) {
        // Update existing file: PATCH metadata must NOT include the "parents" field
        const existingFileId = checkData.files[0].id;
        const updateMetadata = { name: fileName };
        const updateFormData = new FormData();
        updateFormData.append("metadata", new Blob([JSON.stringify(updateMetadata)], { type: "application/json" }));
        updateFormData.append("file", fileContentBlob);

        uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: updateFormData,
        });
      } else {
        // Create new file: POST metadata includes both name and parents
        const createMetadata = { name: fileName, parents: [folderId] };
        const createFormData = new FormData();
        createFormData.append("metadata", new Blob([JSON.stringify(createMetadata)], { type: "application/json" }));
        createFormData.append("file", fileContentBlob);

        uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: createFormData,
        });
      }

      checkResponse(uploadRes, "GPX upload failed");

      // Update Catalog
      const newSegment: CatalogSegment = {
        id: fileName,
        name,
        ...meta,
      };

      let updatedSegments = catalog.segments.filter((s) => s.id !== fileName);
      updatedSegments.push(newSegment);
      const newCatalog: Catalog = { segments: updatedSegments };

      // Find catalog.json file ID
      const catQuery = encodeURIComponent(`name = 'catalog.json' and '${folderId}' in parents and trashed = false`);
      const catCheck = await fetch(`https://www.googleapis.com/drive/v3/files?q=${catQuery}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      checkResponse(catCheck, "Failed to check existing catalog.json");
      const catCheckData = await catCheck.json();

      let catUploadRes;
      const catContentBlob = new Blob([JSON.stringify(newCatalog, null, 2)], { type: "application/json" });

      if (catCheckData.files && catCheckData.files.length > 0) {
        // Update existing catalog: PATCH metadata must NOT include the "parents" field
        const catFileId = catCheckData.files[0].id;
        const catUpdateMetadata = { name: "catalog.json" };
        const catUpdateFormData = new FormData();
        catUpdateFormData.append("metadata", new Blob([JSON.stringify(catUpdateMetadata)], { type: "application/json" }));
        catUpdateFormData.append("file", catContentBlob);

        catUploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${catFileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catUpdateFormData,
        });
      } else {
        // Create new catalog: POST metadata includes name and parents
        const catCreateMetadata = { name: "catalog.json", parents: [folderId] };
        const catCreateFormData = new FormData();
        catCreateFormData.append("metadata", new Blob([JSON.stringify(catCreateMetadata)], { type: "application/json" }));
        catCreateFormData.append("file", catContentBlob);

        catUploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catCreateFormData,
        });
      }

      checkResponse(catUploadRes, "Catalog update failed");

      setCatalog(newCatalog);
      return true;
    } catch (e: any) {
      alert("Error saving: " + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Save rankings.json file to Google Drive
  const saveRankingsToDrive = async (updatedRankings: CloudRankings): Promise<boolean> => {
    if (!accessToken) return false;
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not find app folder");

      const rankQuery = encodeURIComponent(`name = 'rankings.json' and '${folderId}' in parents and trashed = false`);
      const rankCheck = await fetch(`https://www.googleapis.com/drive/v3/files?q=${rankQuery}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const rankCheckData = await rankCheck.json();

      let rankUploadRes;
      const rankContentBlob = new Blob([JSON.stringify(updatedRankings, null, 2)], { type: "application/json" });

      if (rankCheckData.files && rankCheckData.files.length > 0) {
        const fileId = rankCheckData.files[0].id;
        const rankUpdateMetadata = { name: "rankings.json" };
        const rankUpdateFormData = new FormData();
        rankUpdateFormData.append("metadata", new Blob([JSON.stringify(rankUpdateMetadata)], { type: "application/json" }));
        rankUpdateFormData.append("file", rankContentBlob);

        rankUploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: rankUpdateFormData,
        });
      } else {
        const rankCreateMetadata = { name: "rankings.json", parents: [folderId] };
        const rankCreateFormData = new FormData();
        rankCreateFormData.append("metadata", new Blob([JSON.stringify(rankCreateMetadata)], { type: "application/json" }));
        rankCreateFormData.append("file", rankContentBlob);

        rankUploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: rankCreateFormData,
        });
      }

      if (!rankUploadRes.ok) {
        const errorText = await rankUploadRes.text();
        throw new Error(`Rankings update failed: ${rankUploadRes.status} ${rankUploadRes.statusText} - ${errorText}`);
      }

      setRankings(updatedRankings);
      return true;
    } catch (e: any) {
      alert("Error saving rankings: " + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Add attempt to cloud
  const addAttemptToCloud = async (
    segmentId: string,
    attempt: Omit<CloudAttempt, "id">
  ): Promise<boolean> => {
    const newAttempt: CloudAttempt = {
      id: Date.now().toString(),
      ...attempt,
    };
    const currentAttempts = rankings[segmentId] || [];
    const updatedAttempts = [...currentAttempts, newAttempt];
    const updatedRankings = {
      ...rankings,
      [segmentId]: updatedAttempts,
    };
    return await saveRankingsToDrive(updatedRankings);
  };

  // Delete attempt from cloud
  const deleteAttemptFromCloud = async (segmentId: string, attemptId: string): Promise<boolean> => {
    if (!rankings[segmentId]) return false;
    const updatedAttempts = rankings[segmentId].filter((att) => att.id !== attemptId);
    const updatedRankings = {
      ...rankings,
      [segmentId]: updatedAttempts,
    };
    return await saveRankingsToDrive(updatedRankings);
  };

  // Delete a segment and update catalog
  const deleteSegment = async (segmentId: string): Promise<boolean> => {
    if (!accessToken) return false;
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not find app folder");

      // 1. Search for the GPX file ID
      const query = encodeURIComponent(`name = '${segmentId}' and '${folderId}' in parents and trashed = false`);
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const checkData = await checkRes.json();

      if (checkData.files && checkData.files.length > 0) {
        const fileId = checkData.files[0].id;
        // Delete GPX file from Google Drive
        const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!delRes.ok && delRes.status !== 404) {
          throw new Error("Failed to delete GPX file from Google Drive");
        }
      }

      // 2. Filter catalog segments
      const updatedSegments = catalog.segments.filter((s) => s.id !== segmentId);
      const newCatalog: Catalog = { segments: updatedSegments };

      // 3. Remove rankings entry for this segment
      const updatedRankings = { ...rankings };
      delete updatedRankings[segmentId];
      await saveRankingsToDrive(updatedRankings);

      // Find catalog.json file ID
      const catQuery = encodeURIComponent(`name = 'catalog.json' and '${folderId}' in parents and trashed = false`);
      const catCheck = await fetch(`https://www.googleapis.com/drive/v3/files?q=${catQuery}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const catCheckData = await catCheck.json();

      let catUploadRes;
      const catContentBlob = new Blob([JSON.stringify(newCatalog, null, 2)], { type: "application/json" });

      if (catCheckData.files && catCheckData.files.length > 0) {
        // Update existing catalog: PATCH metadata must NOT include the "parents" field
        const catFileId = catCheckData.files[0].id;
        const catUpdateMetadata = { name: "catalog.json" };
        const catUpdateFormData = new FormData();
        catUpdateFormData.append("metadata", new Blob([JSON.stringify(catUpdateMetadata)], { type: "application/json" }));
        catUpdateFormData.append("file", catContentBlob);

        catUploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${catFileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catUpdateFormData,
        });
      } else {
        // Create new catalog: POST metadata includes name and parents
        const catCreateMetadata = { name: "catalog.json", parents: [folderId] };
        const catCreateFormData = new FormData();
        catCreateFormData.append("metadata", new Blob([JSON.stringify(catCreateMetadata)], { type: "application/json" }));
        catCreateFormData.append("file", catContentBlob);

        catUploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catCreateFormData,
        });
      }

      if (!catUploadRes.ok) {
        const errorText = await catUploadRes.text();
        throw new Error(`Catalog update failed during deletion: ${catUploadRes.status} ${catUploadRes.statusText} - ${errorText}`);
      }

      setCatalog(newCatalog);
      return true;
    } catch (e: any) {
      alert("Error deleting: " + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Rename an existing segment
  const renameSegment = async (segmentId: string, newName: string): Promise<boolean> => {
    if (!accessToken) return false;
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not find app folder");

      const newFileName = `${newName.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;

      // 1. Search for the old GPX file ID and rename it
      const query = encodeURIComponent(`name = '${segmentId}' and '${folderId}' in parents and trashed = false`);
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const checkData = await checkRes.json();

      if (checkData.files && checkData.files.length > 0) {
        const fileId = checkData.files[0].id;
        const renameRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newFileName }),
        });
        if (!renameRes.ok) {
          const errorText = await renameRes.text();
          throw new Error(`Failed to rename GPX file: ${renameRes.status} - ${errorText}`);
        }
      }

      // 2. Update catalog.json entries
      const updatedSegments = catalog.segments.map((seg) => {
        if (seg.id === segmentId) {
          return { ...seg, id: newFileName, name: newName };
        }
        return seg;
      });
      const newCatalog: Catalog = { segments: updatedSegments };

      // Save updated catalog.json
      const catMetadata = { name: "catalog.json" };
      const catContentBlob = new Blob([JSON.stringify(newCatalog, null, 2)], { type: "application/json" });

      const catQuery = encodeURIComponent(`name = 'catalog.json' and '${folderId}' in parents and trashed = false`);
      const catCheck = await fetch(`https://www.googleapis.com/drive/v3/files?q=${catQuery}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const catCheckData = await catCheck.json();

      if (catCheckData.files && catCheckData.files.length > 0) {
        const catFileId = catCheckData.files[0].id;
        const catUpdateFormData = new FormData();
        catUpdateFormData.append("metadata", new Blob([JSON.stringify(catMetadata)], { type: "application/json" }));
        catUpdateFormData.append("file", catContentBlob);

        const catUploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${catFileId}?uploadType=multipart`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: catUpdateFormData,
        });
        if (!catUploadRes.ok) {
          const errorText = await catUploadRes.text();
          throw new Error(`Failed to update catalog.json: ${catUploadRes.status} - ${errorText}`);
        }
      }

      // 3. Update rankings.json keys
      const updatedRankings = { ...rankings };
      if (updatedRankings[segmentId]) {
        updatedRankings[newFileName] = updatedRankings[segmentId];
        delete updatedRankings[segmentId];
        await saveRankingsToDrive(updatedRankings);
      }

      setCatalog(newCatalog);
      return true;
    } catch (e: any) {
      alert("Error renaming: " + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Download a GPX file content by name
  const downloadGPXFile = async (fileName: string): Promise<string | null> => {
    if (!accessToken) return null;
    setLoading(true);
    try {
      const folderId = await findOrCreateFolder(accessToken);
      if (!folderId) throw new Error("Could not find app folder");

      const query = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const checkData = await checkRes.json();

      if (checkData.files && checkData.files.length > 0) {
        const fileId = checkData.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (fileRes.ok) {
          return await fileRes.text();
        }
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    accessToken,
    clientId,
    userEmail,
    loading,
    catalog,
    rankings,
    setClientId,
    login,
    logout,
    saveSegment,
    deleteSegment,
    renameSegment,
    downloadGPXFile,
    addAttemptToCloud,
    deleteAttemptFromCloud,
    refreshCatalog: loadCatalog,
  };
}
