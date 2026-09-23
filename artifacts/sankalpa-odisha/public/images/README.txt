SANKALPA ODISHA — BRANDING IMAGES
==================================

The app loads these 5 branding images from THIS folder
(/public/images/) by default. Place the files here before
building/deploying the frontend.

FILE NAME              ORIGINAL SOURCE (used as automatic fallback)
--------------------   -------------------------------------------------------
circle-pattern.png     https://sankalpa.odisha.gov.in/Images/circle-pattern.png
login.jpg              https://sankalpa.odisha.gov.in/Images/login.jpg
map-big.png            https://sankalpa.odisha.gov.in/Images/map-big.png
odisha-logo.png        https://sankalpa.odisha.gov.in/Images/odisha-logo.png
ocac.png               https://sankalpa.odisha.gov.in/Images/ocac.png

(user.png is no longer needed — the header avatar now uses initials.)

AUTOMATIC FALLBACK
------------------
If a local file above is missing or fails to load, the app
automatically falls back to the original sankalpa.odisha.gov.in
URL shown in the second column, so images never appear broken.
Adding the real files here simply removes the runtime dependency
on the government site.

HOW TO ADD THE FILES
--------------------
Open each URL above in your browser and save the file with the
exact filename shown in the FILE NAME column into this folder.

WHERE THIS FOLDER MAPS ON YOUR SERVER
--------------------------------------
After building the frontend (pnpm --filter @workspace/sankalpa-odisha build),
the images will be at:

  artifacts/sankalpa-odisha/dist/public/images/

Copy that dist/public/images/ folder to your nginx/web server's static root.
Nginx example (inside your server block):

  root /usr/share/nginx/html/Sankalpa_New_V2/artifacts/sankalpa-odisha/dist/public;
  location /images/ {
      try_files $uri =404;
  }
