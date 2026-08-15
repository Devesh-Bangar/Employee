/* ===================================================================
   auth.js — Amazon Cognito Authentication
   Uses amazon-cognito-identity-js SDK (loaded via CDN)
   =================================================================== */

// ---------------------------------------------------------------------------
// Configuration — UPDATE THESE AFTER DEPLOYING THE SAM STACK
// ---------------------------------------------------------------------------
const COGNITO_CONFIG = {
  UserPoolId: "ap-south-1_AeTWB26mZ",
  ClientId: "2ercu26levedgq7glku530dplc",
};

// ---------------------------------------------------------------------------
// SDK references (loaded from CDN in the HTML)
// ---------------------------------------------------------------------------
const userPool = new AmazonCognitoIdentity.CognitoUserPool(COGNITO_CONFIG);

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function login(email, password) {
  return new Promise((resolve, reject) => {
    const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const idToken = result.getIdToken().getJwtToken();
        const accessToken = result.getAccessToken().getJwtToken();
        const refreshToken = result.getRefreshToken().getToken();

        // Store tokens
        localStorage.setItem("idToken", idToken);
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);

        // Decode token to get user info
        const payload = _decodeToken(idToken);
        localStorage.setItem("userGroups", JSON.stringify(payload["cognito:groups"] || []));
        localStorage.setItem("userName", payload["name"] || payload["cognito:username"] || "");
        localStorage.setItem("userEmail", payload["email"] || "");
        localStorage.setItem("userSub", payload["sub"] || "");

        resolve(payload);
      },
      onFailure: (err) => {
        reject(err);
      },
      newPasswordRequired: (userAttributes) => {
        // For newly created users that need to set a password
        // Remove non-mutable attributes
        delete userAttributes.email_verified;
        delete userAttributes.email;
        
        // For MVP, we'll prompt the user via a simple prompt
        const newPassword = prompt("You must set a new password:");
        if (newPassword) {
          cognitoUser.completeNewPasswordChallenge(newPassword, userAttributes, {
            onSuccess: (result) => {
              const idToken = result.getIdToken().getJwtToken();
              const accessToken = result.getAccessToken().getJwtToken();
              const refreshToken = result.getRefreshToken().getToken();

              localStorage.setItem("idToken", idToken);
              localStorage.setItem("accessToken", accessToken);
              localStorage.setItem("refreshToken", refreshToken);

              const payload = _decodeToken(idToken);
              localStorage.setItem("userGroups", JSON.stringify(payload["cognito:groups"] || []));
              localStorage.setItem("userName", payload["name"] || payload["cognito:username"] || "");
              localStorage.setItem("userEmail", payload["email"] || "");
              localStorage.setItem("userSub", payload["sub"] || "");

              resolve(payload);
            },
            onFailure: (err) => {
              reject(err);
            },
          });
        } else {
          reject(new Error("Password change cancelled."));
        }
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
function logout() {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
  localStorage.removeItem("idToken");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userGroups");
  localStorage.removeItem("userName");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userSub");
  window.location.href = "login.html";
}

// ---------------------------------------------------------------------------
// Get current ID token (for API calls)
// ---------------------------------------------------------------------------
function getIdToken() {
  const token = localStorage.getItem("idToken");
  if (!token) return null;

  // Check if token is expired
  const payload = _decodeToken(token);
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    // Token expired — try to refresh
    return _refreshSession();
  }
  return Promise.resolve(token);
}

// ---------------------------------------------------------------------------
// Check if user is authenticated
// ---------------------------------------------------------------------------
function isAuthenticated() {
  const token = localStorage.getItem("idToken");
  if (!token) return false;

  const payload = _decodeToken(token);
  const now = Math.floor(Date.now() / 1000);
  return payload.exp && payload.exp > now;
}

// ---------------------------------------------------------------------------
// Get user groups
// ---------------------------------------------------------------------------
function getUserGroups() {
  try {
    return JSON.parse(localStorage.getItem("userGroups") || "[]");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get user name
// ---------------------------------------------------------------------------
function getUserName() {
  return localStorage.getItem("userName") || "User";
}

// ---------------------------------------------------------------------------
// Check role and redirect
// ---------------------------------------------------------------------------
function isAdmin() {
  return getUserGroups().includes("admin");
}

function isEmployee() {
  return getUserGroups().includes("employee");
}

// ---------------------------------------------------------------------------
// Require authentication — redirect to login if not authenticated
// ---------------------------------------------------------------------------
function requireAuth(requiredRole) {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
    return false;
  }
  if (requiredRole === "admin" && !isAdmin()) {
    window.location.href = "employee.html";
    return false;
  }
  if (requiredRole === "employee" && !isEmployee() && !isAdmin()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
function _decodeToken(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

function _refreshSession() {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      logout();
      reject(new Error("No user session"));
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err || !session.isValid()) {
        logout();
        reject(err || new Error("Session invalid"));
        return;
      }

      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem("idToken", idToken);
      localStorage.setItem("accessToken", session.getAccessToken().getJwtToken());

      resolve(idToken);
    });
  });
}
