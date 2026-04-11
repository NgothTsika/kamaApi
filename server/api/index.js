/**
 * Vercel Serverless Function Handler
 *
 * This file serves as the entry point for Vercel deployments.
 * It imports the Express app from src/index.ts and wraps it as a serverless function.
 *
 * For local development, run: yarn dev
 * (which uses src/index.ts directly and starts the server on a port)
 *
 * For Vercel deployment:
 * - Vercel calls this function with each request
 * - The Express app handles routing and middleware
 * - No explicit server.listen() needed (Vercel manages the server)
 */
import app from "../dist/src/index.js";
// Export the Express app as a Vercel serverless function handler
export default (req, res) => {
    return app(req, res);
};
//# sourceMappingURL=index.js.map