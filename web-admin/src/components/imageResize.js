export const handleImageChange = (file, setPreview, setError) => {
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
        setError("Image must be under 8MB.");
        return;
    }

    setError("");

    const reader = new FileReader();

    reader.onload = (ev) => {
        const img = new Image();

        img.onload = () => {
            const MAX_DIM = 500;
            let { width, height } = img;

            if (width > height && width > MAX_DIM) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
            } else if (height > MAX_DIM) {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const resizedImage = canvas.toDataURL("image/jpeg", 0.8);

            setPreview(resizedImage);
        };

        img.onerror = () => {
            setError("Couldn't read that file — try a different image.");
        };

        img.src = ev.target.result;
    };

    reader.onerror = () => {
        setError("Couldn't read that file — try a different image.");
    };

    reader.readAsDataURL(file);
};