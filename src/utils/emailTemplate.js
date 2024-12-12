const createEmailTemplate = (videoUrl, orderDetails) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Sora Video is Ready</title>
</head>
<body style="
    margin: 0;
    padding: 0;
    background-color: #0a0a0a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #ffffff;
">
    <div style="
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        background: linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
        border-radius: 16px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        margin-top: 20px;
        margin-bottom: 20px;
    ">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="
                color: #ffffff;
                font-size: 24px;
                margin-bottom: 10px;
                font-weight: 600;
            ">Your AI Video is Ready! 🎬</h1>
            <p style="
                color: rgba(255,255,255,0.8);
                font-size: 16px;
                line-height: 1.5;
                margin-bottom: 20px;
            ">We've successfully generated your video using Sora AI</p>
        </div>

        <div style="
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
        ">
            <h2 style="
                color: #ffffff;
                font-size: 18px;
                margin-bottom: 15px;
                font-weight: 500;
            ">Video Details</h2>
            <p style="
                color: rgba(255,255,255,0.8);
                font-size: 14px;
                line-height: 1.6;
                margin: 0;
            "><strong>Prompt:</strong> ${orderDetails.prompt}</p>
            <p style="
                color: rgba(255,255,255,0.8);
                font-size: 14px;
                line-height: 1.6;
                margin: 8px 0;
            "><strong>Resolution:</strong> ${orderDetails.resolution}p</p>
            <p style="
                color: rgba(255,255,255,0.8);
                font-size: 14px;
                line-height: 1.6;
                margin: 0;
            "><strong>Duration:</strong> ${orderDetails.duration}</p>
        </div>

        <div style="text-align: center;">
            <a href="${videoUrl}" 
               style="
                   display: inline-block;
                   background-color: #ffffff;
                   color: #000000;
                   padding: 12px 24px;
                   border-radius: 8px;
                   text-decoration: none;
                   font-weight: 500;
                   font-size: 16px;
                   transition: all 0.3s ease;
               "
               target="_blank"
            >
                Download Your Video
            </a>
        </div>

        <div style="
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
            text-align: center;
        ">
            <p style="
                color: rgba(255,255,255,0.6);
                font-size: 12px;
                margin: 0;
            ">
                Note: This video link will expire soon. Please download your video as soon as possible.
            </p>
        </div>
    </div>
</body>
</html>
`;

module.exports = createEmailTemplate;