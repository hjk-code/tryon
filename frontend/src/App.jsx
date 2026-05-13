import React, { useState, useRef } from 'react';
import axios from 'axios';

const carouselItemsData = [
  { name: "Laaleh Item 1", imgUrl: "https://laaleh.com/wp-content/uploads/2026/03/DSC00413-copy-630x776.jpg" },
  { name: "Laaleh Item 2", imgUrl: "https://laaleh.com/wp-content/uploads/2026/03/DSC00354-copy-630x776.jpg" },
  { name: "Laaleh Item 3", imgUrl: "https://laaleh.com/wp-content/uploads/2026/03/DSC05285-copy-630x776.jpg" },
  { name: "Laaleh Item 4", imgUrl: "https://laaleh.com/wp-content/uploads/2024/03/IMG-20250704-WA0012-630x776.webp" },
];

function App() {
  const [activeItemIndex, setActiveItemIndex] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userFile, setUserFile] = useState(null);
  const [styleFile, setStyleFile] = useState(null);
  const [userStyles, setUserStyles] = useState([]);
  const [category, setCategory] = useState('one-pieces'); // Default to full outfit

  const isGeneratingRef = useRef(false);

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  // 🔥 NEW REF (style upload)
  const styleInputRef = useRef(null);

  const handleCarouselClick = (index) => {
    setActiveItemIndex(index);
    
    // Check if it's a custom style or preset
    const allItems = [...carouselItemsData, ...userStyles];
    
    // 🔥 FIX: Always update preview when a dress is selected
    // If we have a user file, we still want to see the dress we picked!
    if (allItems[index]) {
      setPreviewImage(allItems[index].imgUrl);
    }
    
    // Update styleFile for custom styles
    if (userStyles[index - carouselItemsData.length]) {
      setStyleFile(userStyles[index - carouselItemsData.length].file);
    } else {
      setStyleFile(null);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUserFile(file);
    setGeneratedImage(null);
    const reader = new FileReader();
    reader.onload = (evt) => setPreviewImage(evt.target.result);
    reader.readAsDataURL(file);
  };

  // 🔥 NEW HANDLER (STYLE IMAGE)
  const handleStyleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStyleFile(file);
    
    // Create preview URL and add to carousel
    const reader = new FileReader();
    reader.onload = (evt) => {
      const newStyle = {
        name: `Custom Style ${userStyles.length + 1}`,
        imgUrl: evt.target.result,
        isCustom: true,
        file: file
      };
      setUserStyles([...userStyles, newStyle]);
      // Auto-select the newly uploaded style
      setActiveItemIndex(carouselItemsData.length + userStyles.length);
    };
    reader.readAsDataURL(file);
    console.log("Style image selected:", file);
  };

  // 🔥 HELPER: Convert file to base64 data URL
  const fileToDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => resolve(evt.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (isGeneratingRef.current || loading) return;

    isGeneratingRef.current = true;
    setLoading(true);
    setGeneratedImage(null);

    if (!userFile) {
      alert("Please upload a photo first!");
      isGeneratingRef.current = false;
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('person_img', userFile);
    formData.append('category', category); // Send category to backend

    // 🔥 CHECK IF CUSTOM STYLE IS SELECTED
    if (activeItemIndex !== null && activeItemIndex >= carouselItemsData.length) {
      const customStyleIndex = activeItemIndex - carouselItemsData.length;
      if (userStyles[customStyleIndex]) {
        // 🔥 USE CUSTOM IMAGE AS DRESS
        const customImageDataURL = await fileToDataURL(userStyles[customStyleIndex].file);
        formData.append('dress_url', customImageDataURL);
        console.log("Using custom style image as dress");
      } else {
        // Fallback to first preset
        formData.append('dress_url', carouselItemsData[0].imgUrl);
      }
    } else {
      // 🔥 USE PRESET DRESS
      const selectedDress =
        activeItemIndex !== null
          ? carouselItemsData[activeItemIndex]?.imgUrl || carouselItemsData[0].imgUrl
          : carouselItemsData[0].imgUrl;

      formData.append('dress_url', selectedDress);
      console.log("Using preset dress:", selectedDress);
    }

    try {
      const response = await axios.post(
        'https://8000-i4vy013t8njhcmwlelezr-6c7dd1e5.us2.manus.computer/api/generate-tryon',
        formData
      );

      console.log("API RESPONSE:", response.data);

      if (response.data?.error) {
        console.error("Backend Error:", response.data.error, response.data.details);
        alert(`⚠️ Generation failed: ${response.data.error}\n\nDetails: ${JSON.stringify(response.data.details)}`);
      } else if (response.data?.image_url) {
        setGeneratedImage(response.data.image_url);
        alert("✅ Your look is ready! The AI enhanced your garment selection for better try-on results.");
      } else {
        console.error("Unexpected response:", response.data);
        alert("⚠️ Generation failed. Unexpected response from backend.");
      }

    } catch (error) {
      console.error("AI Generation failed:", error);
      const errorMsg = error.response?.data?.error || error.message || "Unknown error";
      alert(`⚠️ Generation failed: ${errorMsg}`);
    } finally {
      setLoading(false);
      isGeneratingRef.current = false;
    }
  };

  const scroll = (direction) => {
    if (direction === 'left') scrollRef.current.scrollLeft -= 180;
    else scrollRef.current.scrollLeft += 180;
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[linear-gradient(145deg,#fff5f9_0%,#ffe9f0_100%)] font-['Inter']">

      <div className="max-w-[1280px] w-full bg-[#fff8fbda] backdrop-blur-[2px] rounded-[3rem] shadow-[0_25px_45px_rgba(241,101,153,0.2),0_8px_18px_rgba(0,0,0,0.05)] overflow-hidden transition-all duration-200">
        <div className="p-8 md:p-12 pb-6">

          <div className="text-center mb-8">
            <h1 className="font-['Playfair_Display'] text-[2.6rem] font-semibold bg-[linear-gradient(135deg,#E85D9E,#FF8AB5,#F6AED0)] bg-clip-text text-transparent tracking-[-0.3px] mb-2">
              laaleh<span className="font-light">✦</span>try-on
            </h1>
            <p className="text-[#B1537A] font-medium text-[1.1rem] bg-[#fff0f5cc] px-[1.2rem] py-[0.25rem] rounded-[40px] inline-block backdrop-blur-[2px]">
              ✨ virtually style yourself ✨
            </p>
          </div>

          <div className="bg-[#FFFBFC] rounded-[2rem] shadow-[0_12px_28px_rgba(232,112,156,0.15)] min-h-[380px] flex items-center justify-center mb-8 p-6 border border-[#ff98ba4d] transition-all relative overflow-hidden">

            {previewImage ? (
              <img
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-[420px] object-contain rounded-[1.5rem] shadow-[0_8px_20px_rgba(0,0,0,0.1)] animate-[gentleFade_0.3s_ease]"
              />
            ) : (
              <div className="flex flex-row items-center gap-3 md:gap-6 text-[#cb7a9c] px-4 w-full justify-center">
                <i className="fas fa-tshirt text-[3rem] sm:text-[4rem] md:text-[5rem] text-[#F6A7C1] opacity-70 shrink-0"></i>
                <h3 className="text-lg sm:text-xl md:text-[1.8rem] font-medium text-[#C75C86] leading-none">
                  Your look starts here
                </h3>
                <p className="text-xs sm:text-sm md:text-[1.1rem] leading-tight max-w-[150px] sm:max-w-[200px] md:max-w-[300px]">
                  Pick a style from the carousel or upload your full-length photo below
                </p>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-white/60 flex flex-col items-center justify-center backdrop-blur-sm">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E85D9E] mb-4"></div>
                <div className="text-center text-[#B44C76] font-semibold">
                  <p>✨ Enhancing your look...</p>
                  <p className="text-xs text-[#E85D9E] mt-2">Processing garment details</p>
                </div>
              </div>
            )}
          </div>

          {/* 🔥 CATEGORY SELECTOR */}
          <div className="flex justify-center gap-3 mb-8">
            {['tops', 'bottoms', 'one-pieces'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all border-2 
                  ${category === cat 
                    ? 'bg-[#E85D9E] border-[#E85D9E] text-white shadow-lg scale-105' 
                    : 'bg-white border-[#FFB3CE] text-[#B44C76] hover:border-[#E85D9E]'}`}
              >
                {cat === 'one-pieces' ? 'Full Outfit' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex justify-center mb-8">
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-[linear-gradient(105deg,#E85D9E_0%,#FF84B5_100%)] text-white px-[2.4rem] py-4 rounded-[60px] font-semibold text-[1.1rem] flex items-center gap-3 shadow-[0_12px_18px_-8px_rgba(232,93,158,0.4)] border border-white/40 hover:-translate-y-[3px] hover:shadow-[0_20px_24px_-10px_rgba(232,93,158,0.5)] active:translate-y-[1px] transition-all"
            >
              <i className="fas fa-camera-retro text-[1.3rem]"></i> Upload your full-length photo
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*"
            />
          </div>

          {/* 🔥 STYLE HEADER WITH BUTTON & TIPS */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 text-[#B44C76] font-semibold text-[0.9rem] tracking-[0.5px] mb-3">
              <span>choose a style picture</span>

              {/* 🔥 NEW BUTTON */}
              <button
                onClick={() => styleInputRef.current.click()}
                className="ml-2 flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-[#E85D9E] text-[#E85D9E] text-[0.75rem] hover:bg-[#FFE2ED] transition"
              >
                <i className="fas fa-plus-circle"></i>
                Add your own style
              </button>

              <i className="fas fa-arrow-right text-[#E85D9E]"></i>

              {/* hidden input */}
              <input
                type="file"
                ref={styleInputRef}
                onChange={handleStyleUpload}
                className="hidden"
                accept="image/*"
              />
            </div>

            {/* 🔥 TIPS FOR BETTER RESULTS */}
            <div className="bg-[#fff0f5] border-l-4 border-[#E85D9E] p-3 rounded text-left text-[0.85rem] text-[#B44C76] max-w-[600px] mx-auto mb-3">
              <p className="font-semibold mb-1">💡 Tips for best results with custom garments:</p>
              <ul className="text-[0.8rem] space-y-1">
                <li>✓ Use clear, well-lit photos of the garment</li>
                <li>✓ Capture the full shalwar/dress from top to bottom</li>
                <li>✓ Minimize background - garment should be main focus</li>
                <li>✓ Avoid patterns that are too complex or intricate</li>
              </ul>
            </div>
          </div>

          <div className="relative rounded-[2rem] bg-[#fff0f5b3] p-[0.8rem_0.5rem] mb-6">
            <div
              ref={scrollRef}
              className="flex overflow-x-auto gap-4 p-[0.5rem_1rem] scroll-smooth no-scrollbar"
              style={{ scrollbarWidth: 'none' }}
            >
              {carouselItemsData.map((item, idx) => (
                <div
                  key={`preset-${idx}`}
                  onClick={() => handleCarouselClick(idx)}
                  className={`flex-none w-[100px] sm:w-[110px] cursor-pointer rounded-[24px] overflow-hidden bg-white shadow-[0_6px_12px_rgba(171,75,111,0.15)] transition-all duration-200 border-2 
                  ${activeItemIndex === idx
                    ? 'border-[#E85D9E] scale-[1.05] shadow-[0_12px_20px_rgba(232,93,158,0.3)]'
                    : 'border-transparent hover:-translate-y-2 hover:border-[#FFB3CE]'
                  }`}
                >
                  <div className="relative w-full aspect-[3/4] bg-[#FFE2ED]">
                    <img
                      src={item.imgUrl}
                      alt={item.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                </div>
              ))}
              {userStyles.map((item, idx) => (
                <div
                  key={`custom-${idx}`}
                  onClick={() => handleCarouselClick(carouselItemsData.length + idx)}
                  className={`flex-none w-[100px] sm:w-[110px] cursor-pointer rounded-[24px] overflow-hidden bg-white shadow-[0_6px_12px_rgba(171,75,111,0.15)] transition-all duration-200 border-2 relative
                  ${activeItemIndex === carouselItemsData.length + idx
                    ? 'border-[#E85D9E] scale-[1.05] shadow-[0_12px_20px_rgba(232,93,158,0.3)]'
                    : 'border-transparent hover:-translate-y-2 hover:border-[#FFB3CE]'
                  }`}
                >
                  <div className="relative w-full aspect-[3/4] bg-[#FFE2ED]">
                    <img
                      src={item.imgUrl}
                      alt={item.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute top-1 right-1 bg-white rounded-full p-1 opacity-0 hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserStyles(userStyles.filter((_, i) => i !== idx));
                        setActiveItemIndex(null);
                      }}
                      className="text-[#E85D9E] text-xs"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center mb-8">
            <button
              onClick={handleGenerate}
              disabled={loading || !userFile || isGeneratingRef.current}
              className={`bg-[linear-gradient(105deg,#E85D9E_0%,#FF84B5_100%)] text-white px-[2.4rem] py-4 rounded-[60px] font-semibold text-[1.1rem] flex items-center gap-3 shadow-[0_12px_18px_-8px_rgba(232,93,158,0.4)] border border-white/40 transition-all 
                ${(!userFile || loading)
                  ? 'opacity-60 cursor-not-allowed grayscale'
                  : 'hover:-translate-y-[3px] hover:shadow-[0_20px_24px_-10px_rgba(232,93,158,0.5)] active:translate-y-[1px]'}`}
            >
              <i className={`fas ${loading ? 'fa-sync-alt animate-spin' : 'fa-magic'} text-[1.3rem]`}></i>
              {loading ? 'Generating...' : '✨ Generate Your Look ✨'}
            </button>
          </div>

          {generatedImage !== null && (
            <div className="mt-12 p-8 bg-white rounded-[3rem] border-4 border-[#FFB3CE] shadow-2xl">
              <h2 className="text-center text-2xl text-[#E85D9E] mb-6 font-bold">Your AI Transformation</h2>
              <div className="flex justify-center">
                <img 
                  src={generatedImage} 
                  alt="AI Result" 
                  className="max-w-full max-h-[600px] object-contain rounded-[2rem]" 
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;