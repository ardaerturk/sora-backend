const createEmailTemplate = (videoUrl, orderDetails) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your AI Video is Ready</title>
</head>
<body style="
    margin: 0;
    padding: 20px;
    background-color: #0a0a0a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #ffffff;
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
">
    <div style="
        max-width: 600px;
        margin: 0 auto;
        background: linear-gradient(145deg, rgba(38,38,38,0.95), rgba(25,25,25,0.95));
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        overflow: hidden;
    ">
        <!-- Header Section -->
        <div style="
            background: linear-gradient(to right, #2d2d2d, #1a1a1a);
            padding: 30px 20px;
            text-align: center;
        ">
            <div style="
                font-size: 32px;
                margin-bottom: 5px;
            ">✨</div>
            <h1 style="
                color: #ffffff;
                font-size: 24px;
                margin: 0;
                font-weight: 600;
                letter-spacing: -0.5px;
            ">Your AI Video is Ready</h1>
        </div>

        <!-- Main Content -->
        <div style="padding: 30px 25px;">
            <p style="
                color: rgba(255,255,255,0.9);
                font-size: 16px;
                line-height: 1.6;
                margin: 0 0 25px 0;
                text-align: center;
            ">We've brought your vision to life with Sora AI. Your video is now ready to view!</p>

            <!-- Video Details Card -->
            <div style="
                background: rgba(0,0,0,0.2);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 30px;
                border: 1px solid rgba(255,255,255,0.05);
            ">
                <h2 style="
                    color: #ffffff;
                    font-size: 16px;
                    margin: 0 0 15px 0;
                    font-weight: 500;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                ">Creation Details</h2>
                
                <div style="margin-bottom: 12px;">
                    <div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-bottom: 4px;">PROMPT</div>
                    <div style="color: #ffffff; font-size: 14px; line-height: 1.4;">${orderDetails.prompt}</div>
                </div>
                
                <div style="
                    display: flex;
                    justify-content: space-between;
                    margin-top: 15px;
                    padding-top: 15px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                ">
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 12px;">RESOLUTION</div>
                        <div style="color: #ffffff; font-size: 14px;">${orderDetails.resolution}p</div>
                    </div>
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 12px;">DURATION</div>
                        <div style="color: #ffffff; font-size: 14px;">${orderDetails.duration}</div>
                    </div>
                </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; padding: 10px 0 30px 0;">
                <a href="${videoUrl}" 
                   style="
                       display: inline-block;
                       background: linear-gradient(90deg, #3898FF, #7A70FF);
                       color: #ffffff;
                       padding: 16px 32px;
                       border-radius: 12px;
                       text-decoration: none;
                       font-weight: 600;
                       font-size: 16px;
                       transition: all 0.3s ease;
                       box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                       margin: 0 auto;
                   "
                   target="_blank"
                >
                    View Your Video
                </a>
            </div>

            <!-- Direct Link -->
            <div style="text-align: center;">
                <p style="
                    color: rgba(255,255,255,0.5);
                    font-size: 12px;
                    margin: 0;
                    line-height: 1.5;
                ">
                    Alternatively, you can access your video directly at:<br>
                    <a href="${videoUrl}" 
                       style="
                           color: rgba(255,255,255,0.5);
                           text-decoration: underline;
                           word-break: break-all;
                       "
                    >${videoUrl}</a>
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="
            background: rgba(0,0,0,0.2);
            padding: 20px;
            text-align: center;
            border-top: 1px solid rgba(255,255,255,0.05);
        ">
            <p style="
                color: rgba(255,255,255,0.4);
                font-size: 12px;
                margin: 0;
            ">
                Generated with ❤️ by AI
            </p>
        </div>
    </div>
</body>
</html>
`;

module.exports = createEmailTemplate;