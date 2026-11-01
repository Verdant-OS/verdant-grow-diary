// Email-safe equivalents of Verdant's botanical theme; the email canvas stays white.
export const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
export const container = { padding: "32px 25px", maxWidth: "560px" };
export const h1 = {
  fontSize: "24px",
  fontWeight: "bold" as const,
  color: "#173322",
  margin: "0 0 20px",
};
export const text = { fontSize: "15px", color: "#37463d", lineHeight: "1.6", margin: "0 0 25px" };
export const link = { color: "#2d864f", textDecoration: "underline" };
export const button = {
  backgroundColor: "#2d864f",
  color: "#ffffff",
  fontSize: "15px",
  border: "1px solid #2d864f",
  borderRadius: "6px",
  padding: "14px 22px",
  textDecoration: "none",
};
export const footer = { fontSize: "12px", color: "#526259", lineHeight: "1.5", margin: "30px 0 0" };
export const codeStyle = {
  fontFamily: "Courier, monospace",
  fontSize: "24px",
  fontWeight: "bold" as const,
  color: "#173322",
  margin: "0 0 30px",
};
export const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #2d864f !important; color: #ffffff !important; }
  }
  [data-ogsc] .dm-btn { background-color: #2d864f !important; color: #ffffff !important; }
  [data-ogsb] .dm-btn { background-color: #2d864f !important; color: #ffffff !important; }
`;
