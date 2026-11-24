import nodemailer from "nodemailer";

function transporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

export async function sendInviteEmail(to, {teamName, teamId, role}) {
  const tx = transporter();
  if (!tx) throw new Error("SMTP is not configured. Add SMTP settings to backend/.env");
  await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject: `Invitation to ${teamName} on Dev Intelligence`, text: `You have been invited to ${teamName}. Team ID: ${teamId}. Role: ${role}. Sign up at ${process.env.CLIENT_URL || "http://localhost:5173"} and choose Join team using this Team ID.`, html: `<div style="font-family:Arial;padding:24px"><h2>Dev Intelligence</h2><p>You have been invited to <b>${teamName}</b>.</p><p>Team ID: <b>${teamId}</b></p><p>Role: <b>${role}</b></p><p>Open the app and choose <b>Join team</b> during sign up.</p></div>` });
}

export async function sendOtpEmail(to, otp) {
  const tx = transporter();
  if (!tx) throw new Error("SMTP is not configured. Add SMTP settings to backend/.env");
  await tx.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: "Your Dev Intelligence verification code",
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `<div style="font-family:Arial;padding:24px"><h2>Dev Intelligence</h2><p>Your verification code:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</div><p>This code expires in 10 minutes.</p></div>`
  });
}
