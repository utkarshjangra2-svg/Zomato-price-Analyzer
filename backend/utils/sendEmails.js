import nodemailer from "nodemailer";

const mapEmailError = (error) => {
  const rawMessage = error?.message || "";
  const responseCode = Number(error?.responseCode || 0);

  if (responseCode === 535 || /BadCredentials|Username and Password not accepted/i.test(rawMessage)) {
    return new Error(
      "Email login failed. For Gmail, use an App Password in backend/.env instead of your normal account password."
    );
  }

  if (/Invalid login/i.test(rawMessage)) {
    return new Error("Email service login failed. Check EMAIL and EMAIL_PASS in backend/.env.");
  }

  return new Error("Unable to send reset email right now. Check your email configuration and try again.");
};

const createTransporter = () => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    throw new Error("Email service is not configured. Set EMAIL and EMAIL_PASS in backend/.env");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASS
    }
  });
};

export const sendResetEmail = async ({ email, resetLink, name = "there" }) => {
  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"SmartDeal" <${process.env.EMAIL}>`,
      to: email,
      subject: "Reset your SmartDeal password",
      text: `Hi ${name}, reset your password using this link: ${resetLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2 style="margin-bottom: 12px;">Reset your SmartDeal password</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Use the button below to continue.</p>
          <p style="margin: 24px 0;">
            <a
              href="${resetLink}"
              style="background:#d9481f;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;"
            >
              Reset Password
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p>${resetLink}</p>
          <p>This link expires in 10 minutes.</p>
        </div>
      `
    });
  } catch (error) {
    throw mapEmailError(error);
  }
};
