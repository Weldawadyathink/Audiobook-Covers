BASE_DIR := images
INPUT_DIR := $(BASE_DIR)/original
ORIGINAL_IMAGES := $(wildcard $(INPUT_DIR)/*)
JPEG_320 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/jpeg/320/%.jpg,$(basename $(ORIGINAL_IMAGES)))
JPEG_640 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/jpeg/640/%.jpg,$(basename $(ORIGINAL_IMAGES)))
JPEG_1280 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/jpeg/1280/%.jpg,$(basename $(ORIGINAL_IMAGES)))
WEBP_320 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/webp/320/%.webp,$(basename $(ORIGINAL_IMAGES)))
WEBP_640 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/webp/640/%.webp,$(basename $(ORIGINAL_IMAGES)))
WEBP_1280 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/webp/1280/%.webp,$(basename $(ORIGINAL_IMAGES)))
AVIF_320 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/avif/320/%.avif,$(basename $(ORIGINAL_IMAGES)))
AVIF_640 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/avif/640/%.avif,$(basename $(ORIGINAL_IMAGES)))
AVIF_1280 := $(patsubst $(INPUT_DIR)/%,$(BASE_DIR)/avif/1280/%.avif,$(basename $(ORIGINAL_IMAGES)))

.PHONY: all clean print ensure_out_dir

all: ensure_out_dir $(JPEG_320) $(JPEG_640) $(JPEG_1280) $(WEBP_320) $(WEBP_640) $(WEBP_1280) $(AVIF_320) $(AVIF_640) $(AVIF_1280)

$(BASE_DIR)/jpeg/320/%.jpg: $(INPUT_DIR)/%.*
	magick "$<" -resize "320x320>" -quality 85 "JPG:$@"

$(BASE_DIR)/jpeg/640/%.jpg: $(INPUT_DIR)/%.*
	magick "$<" -resize "640x640>" -quality 85 "JPG:$@"

$(BASE_DIR)/jpeg/1280/%.jpg: $(INPUT_DIR)/%.*
	magick "$<" -resize "1280x1280>" -quality 85 "JPG:$@"

$(BASE_DIR)/webp/320/%.webp: $(INPUT_DIR)/%.*
	magick "$<" -resize "320x320>" -quality 85 "WEBP:$@"

$(BASE_DIR)/webp/640/%.webp: $(INPUT_DIR)/%.*
	magick "$<" -resize "640x640>" -quality 85 "WEBP:$@"

$(BASE_DIR)/webp/1280/%.webp: $(INPUT_DIR)/%.*
	magick "$<" -resize "1280x1280>" -quality 85 "WEBP:$@"

$(BASE_DIR)/avif/320/%.avif: $(INPUT_DIR)/%.*
	magick "$<" -resize "320x320>" -quality 85 "AVIF:$@"

$(BASE_DIR)/avif/640/%.avif: $(INPUT_DIR)/%.*
	magick "$<" -resize "640x640>" -quality 85 "AVIF:$@"

$(BASE_DIR)/avif/1280/%.avif: $(INPUT_DIR)/%.*
	magick "$<" -resize "1280x1280>" -quality 85 "AVIF:$@"

ensure_out_dir:
	@mkdir -p $(BASE_DIR)/jpeg/320
	@mkdir -p $(BASE_DIR)/jpeg/640
	@mkdir -p $(BASE_DIR)/jpeg/1280
	@mkdir -p $(BASE_DIR)/webp/320
	@mkdir -p $(BASE_DIR)/webp/640
	@mkdir -p $(BASE_DIR)/webp/1280
	@mkdir -p $(BASE_DIR)/avif/320
	@mkdir -p $(BASE_DIR)/avif/640
	@mkdir -p $(BASE_DIR)/avif/1280

clean:
	@rm -rf $(BASE_DIR)/jpeg
	@rm -rf $(BASE_DIR)/webp
	@rm -rf $(BASE_DIR)/avif
