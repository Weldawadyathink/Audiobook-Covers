<template>
    <div class="hover:scale-110 ease-in-out duration-300 w-80 h-80 aspect-square">
        <div :class="{ flipped: isFlipped }" class="card w-full h-full">
            <div @click="flipCard" class="front rounded-3xl overflow-hidden"> 
                <img :src="imageData.versions.webp['200']" class="w-full h-full object-contain" />
            </div>
            <div @click="flipCard" class="back bg-gray-900 border-red-800 rounded-3xl overflow-hidden">
                
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: ['imageData'],
    data() {
        return {
            isFlipped: false, // Initial state of isFlipped
        };
    },
    methods: {
        flipCard() {
            this.isFlipped = !this.isFlipped;
            console.log(this.isFlipped);
        },
    },
};
</script>

<style>
.back {
    transform: rotateY(180deg);
    z-index: 2;
}

.front, .back {
    backface-visibility: hidden;
    position: absolute;
    width: 100%;
    height: 100%;
}

.card.flipped {
    transform: rotateY(180deg);
}

.card {
    transition: transform 0.6s;
    transform-style: preserve-3d;
    cursor: pointer;
}

</style>
