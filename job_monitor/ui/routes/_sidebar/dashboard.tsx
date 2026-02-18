/**
 * Dashboard page - displays current user identity and system status.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentUser, type UserInfo } from "../../lib/api";

export const Route = createFileRoute("/_sidebar/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Current User</h2>
        <div className="space-y-2">
          <p>
            <span className="text-gray-500">Email:</span>{" "}
            <span className="font-medium">{user?.email}</span>
          </p>
          {user?.display_name && (
            <p>
              <span className="text-gray-500">Display Name:</span>{" "}
              <span className="font-medium">{user.display_name}</span>
            </p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800 text-sm">
          {user?.email === "local-dev-user" ? (
            <>
              <strong>Local Development Mode:</strong> Running without Databricks OAuth.
              Deploy to Databricks Apps to see your real identity.
            </>
          ) : (
            <>
              <strong>Authenticated:</strong> Connected via Databricks OAuth.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
