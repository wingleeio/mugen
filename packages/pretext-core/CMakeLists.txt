# Host build for the pretext-core kernel + conformance fixture runner.
# The RN builds (ios podspec / android CMake) compile the same cpp/ sources.
cmake_minimum_required(VERSION 3.20)
project(pretext_core CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Byte-identical doubles vs JS: no contraction, no fast-math.
add_compile_options(-O2 -ffp-contract=off -fno-fast-math)

file(GLOB_RECURSE PRETEXT_SOURCES CONFIGURE_DEPENDS cpp/pretext/*.cpp)
add_library(pretext_core STATIC ${PRETEXT_SOURCES})
target_include_directories(pretext_core PUBLIC cpp)

add_executable(fixture-runner tools/fixture-runner/main.cpp)
target_include_directories(fixture-runner PRIVATE tools/fixture-runner/vendor)
target_link_libraries(fixture-runner PRIVATE pretext_core)
